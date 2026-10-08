import { z } from "zod";
import type { RecallBot } from "@/lib/recall/types";

export const RETENTION_OPTIONS = [30, 90, 180, 365] as const;
export const RetentionSchema = z.union([z.literal(null), z.literal(30), z.literal(90), z.literal(180), z.literal(365)]);
export type CleanupKind = "user" | "calendar" | "meeting";
export class CleanupDeferred extends Error {
  constructor(message: string, public readonly delaySeconds = 60) { super(message); }
}

export function isTerminalBot(status: string) {
  return status === "done" || status === "fatal" || status.startsWith("fatal:");
}

export interface RecordingCleaner {
  retrieve(botId: string, account: string): Promise<RecallBot>;
  cancel(botId: string, account: string): Promise<void>;
  leave(botId: string, account: string): Promise<void>;
  deleteRecording(recordingId: string, account: string): Promise<void>;
  isHttpError(error: unknown, status: number): boolean;
}

// Use provider state, rather than potentially stale webhook state, to decide
// whether to cancel, leave, or remove completed recording artifacts.
export async function deleteMeetingRecordings(botId: string, account: string, cleaner: RecordingCleaner) {
  let bot: RecallBot;
  try { bot = await cleaner.retrieve(botId, account); }
  catch (error) { if (cleaner.isHttpError(error, 404)) return; throw error; }
  const state = bot.status_changes.at(-1)?.code ?? "";
  if (!isTerminalBot(state)) {
    try { await cleaner.cancel(botId, account); return; }
    catch (error) {
      if (!cleaner.isHttpError(error, 405)) throw error;
    }
    await cleaner.leave(botId, account);
    throw new CleanupDeferred("Waiting for the bot to finish leaving the call.");
  }
  for (const recording of bot.recordings ?? []) {
    await cleaner.deleteRecording(recording.id, account);
  }
}
