import { clerkClient } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { cancelScheduledBot, deleteCalendar, deleteRecording, RecallApiError, removeBotFromCall, retrieveBot } from "@/lib/recall/client";
import { deleteTranscriptChunksForMeeting } from "@/lib/vector/transcript-chunks";
import { qdrant, TRANSCRIPT_CHUNKS_COLLECTION } from "@/lib/vector/client";
import { CleanupDeferred, deleteMeetingRecordings, type CleanupKind } from "./policy";
import { assertCleanupLease, claimCleanup, markExpiredMeetings, ownedCleanup, releaseCleanup, type CleanupResource } from "./repository";

function missingCollection(error: unknown) {
  return Boolean(error && typeof error === "object" && "status" in error && error.status === 404);
}

const services = {
  recordings: {
    retrieve: retrieveBot, cancel: cancelScheduledBot, leave: removeBotFromCall, deleteRecording,
    isHttpError: (error: unknown, status: number) => error instanceof RecallApiError && error.status === status,
  },
  deleteCalendar,
  async deleteVectors(meetingId: string) {
    try { await deleteTranscriptChunksForMeeting(meetingId); }
    catch (error) { if (!missingCollection(error)) throw error; }
  },
  async deleteUserVectors(userId: string) {
    try {
      await qdrant.delete(TRANSCRIPT_CHUNKS_COLLECTION, { wait: true,
        filter: { must: [{ key: "user_id", match: { value: userId } }] },
      });
    } catch (error) { if (!missingCollection(error)) throw error; }
  },
  async deleteClerkUser(clerkUserId: string) {
    try { const client = await clerkClient(); await client.users.deleteUser(clerkUserId); }
    catch (error) { if (!(error && typeof error === "object" && "status" in error && error.status === 404)) throw error; }
  },
};

async function cleanResource(kind: CleanupKind, resource: CleanupResource, providers = services) {
  if (kind === "meeting") {
    await deleteMeetingRecordings(resource.recall_bot_id!, resource.recall_account!, providers.recordings);
    // An in-flight transcript/vector request can outlive the deletion marker.
    // Wait beyond the webhook's 300-second limit before the final vector sweep.
    const remaining = 310 - Math.floor((Date.now() - new Date(resource.deletion_requested_at).getTime()) / 1000);
    if (remaining > 0) throw new CleanupDeferred("Recordings removed. Waiting for in-flight work before data cleanup.", remaining);
    await assertCleanupLease(kind, resource);
    await providers.deleteVectors(resource.id);
    // All child rows and the meeting disappear together; a failed provider
    // operation leaves the tombstone available for the next attempt.
    const results = await db.batch([
      db.execute(sql`WITH owned AS (${ownedCleanup(kind, resource)}) DELETE FROM transcript_chunks WHERE meeting_id IN (SELECT id FROM owned)`),
      db.execute(sql`WITH owned AS (${ownedCleanup(kind, resource)}) DELETE FROM participants WHERE meeting_id IN (SELECT id FROM owned)`),
      db.execute(sql`WITH owned AS (${ownedCleanup(kind, resource)}) DELETE FROM live_chat_messages WHERE meeting_id IN (SELECT id FROM owned)`),
      db.execute(sql`WITH owned AS (${ownedCleanup(kind, resource)}) DELETE FROM meetings WHERE id IN (SELECT id FROM owned) RETURNING id`),
    ]);
    if (!results.at(-1)?.rows.length) throw new Error("Cleanup lease was revoked");
    return;
  }
  if (kind === "calendar") {
    await providers.deleteCalendar(resource.recall_calendar_id!, resource.recall_account!);
    await assertCleanupLease(kind, resource);
    await db.batch([
      db.execute(sql`WITH owned AS (${ownedCleanup(kind, resource)}) UPDATE meetings SET status = 'fatal:calendar_disconnected'
        WHERE calendar_connection_id IN (SELECT id FROM owned) AND status = 'scheduled'`),
      db.execute(sql`WITH owned AS (${ownedCleanup(kind, resource)}) UPDATE calendar_connections
        SET status = 'disconnected', auto_record = false, cleanup_error = NULL,
          cleanup_lease_token = NULL, cleanup_lease_expires_at = NULL
        WHERE id IN (SELECT id FROM owned)`),
    ]);
    return;
  }
  if (!resource.clerk_deleted_at) {
    if (resource.clerk_user_id) await providers.deleteClerkUser(resource.clerk_user_id);
    await db.execute(sql`WITH owned AS (${ownedCleanup(kind, resource)}) UPDATE users SET clerk_deleted_at = now()
      WHERE id IN (SELECT id FROM owned)`);
    await releaseCleanup(kind, resource, null, 0);
    return;
  }
  // Clean orphaned vectors as well as the points reachable through meetings.
  await providers.deleteUserVectors(resource.id);
  await assertCleanupLease(kind, resource);
  await db.batch([
    db.execute(sql`WITH owned AS (${ownedCleanup(kind, resource)}) DELETE FROM categories WHERE user_id IN (SELECT id FROM owned)`),
    db.execute(sql`WITH owned AS (${ownedCleanup(kind, resource)}) DELETE FROM calendar_connections
      WHERE user_id IN (SELECT id FROM owned) AND status = 'disconnected'`),
    db.execute(sql`WITH owned AS (${ownedCleanup(kind, resource)}) DELETE FROM users WHERE id IN (SELECT id FROM owned)
      AND NOT EXISTS (SELECT 1 FROM meetings WHERE user_id = users.id)
      AND NOT EXISTS (SELECT 1 FROM calendar_connections WHERE user_id = users.id)`),
  ]);
}

export async function runCleanupStep(kind: CleanupKind, id?: string, providers = services) {
  const resource = await claimCleanup(kind, id);
  if (!resource) return { worked: false, completed: false };
  try {
    await cleanResource(kind, resource, providers);
    return { worked: true, completed: true };
  } catch (error) {
    if (!(error instanceof CleanupDeferred)) console.error(`Lifecycle cleanup failed for ${kind} ${resource.id}`, error);
    await releaseCleanup(kind, resource,
      error instanceof CleanupDeferred ? error.message : "Cleanup could not finish. It will be retried automatically.",
      error instanceof CleanupDeferred ? error.delaySeconds : 60);
    return { worked: true, completed: false };
  }
}

export async function runLifecycleCleanup() {
  await markExpiredMeetings();
  // Leave headroom within Hobby's 300-second function limit. Each step is
  // separately leased, so a killed invocation resumes on the next daily run.
  const deadline = Date.now() + 180_000;
  let completed = 0;
  for (let pass = 0; pass < 100 && Date.now() < deadline; pass++) {
    let worked = false;
    for (const kind of ["user", "calendar", "meeting"] as const) {
      if (Date.now() >= deadline) break;
      const result = await runCleanupStep(kind);
      worked ||= result.worked;
      if (result.completed) completed++;
    }
    if (!worked) break;
  }
  return { completed };
}
