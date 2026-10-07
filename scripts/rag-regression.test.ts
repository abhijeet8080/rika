import assert from "node:assert/strict";
import { test } from "node:test";
import { storeLiveTranscript, type LiveTranscriptChunk, type LiveTranscriptWriter } from "../lib/recall/store-live-transcript";
import { fuseCandidates, sampleChronology, selectMeetingsForPlan, type RetrievedChunk, type ScopedMeeting } from "../lib/ai/retrieval-ranking";

const chunk: LiveTranscriptChunk = {
  id: "live-id", meetingId: "meeting", userId: "user", speaker: "Alice",
  startMs: 0, endMs: 1000, text: "Ship it Friday",
};

function fixture() {
  const rows = new Map<string, LiveTranscriptChunk>();
  const vectors = new Map<string, number[]>();
  const state = { active: true };
  const writer: LiveTranscriptWriter = {
    async embed() { return [1, 2]; },
    async isActive() { return state.active; },
    async upsertVector(item, vector) { vectors.set(item.id, vector); },
    async saveChunk(item) { rows.set(item.id, item); },
    async removeChunk(id) { rows.delete(id); vectors.delete(id); },
  };
  return { rows, vectors, state, writer };
}

test("embedding failure can be retried without losing the live utterance", async () => {
  const f = fixture();
  const embed = f.writer.embed;
  f.writer.embed = async () => { throw new Error("embedding unavailable"); };
  await assert.rejects(storeLiveTranscript(chunk, f.writer), /embedding unavailable/);
  assert.equal(f.rows.size, 0);
  f.writer.embed = embed;
  await storeLiveTranscript(chunk, f.writer);
  assert.equal(f.rows.size, 1);
  assert.equal(f.vectors.size, 1);
});

test("redelivery repairs an existing transcript row whose vector is missing", async () => {
  const f = fixture();
  f.rows.set(chunk.id, chunk);
  await storeLiveTranscript(chunk, f.writer);
  await storeLiveTranscript(chunk, f.writer);
  assert.equal(f.rows.size, 1);
  assert.deepEqual(f.vectors.get(chunk.id), [1, 2]);
});

test("database failure after vector persistence can be repaired on redelivery", async () => {
  const f = fixture();
  const save = f.writer.saveChunk;
  f.writer.saveChunk = async () => { throw new Error("database unavailable"); };
  await assert.rejects(storeLiveTranscript(chunk, f.writer), /database unavailable/);
  f.writer.saveChunk = save;
  await storeLiveTranscript(chunk, f.writer);
  assert.equal(f.rows.size, 1);
  assert.equal(f.vectors.size, 1);
});

test("utterances finishing embedding after finalization starts are ignored", async () => {
  const f = fixture();
  f.writer.embed = async () => { f.state.active = false; return [1, 2]; };
  await storeLiveTranscript(chunk, f.writer);
  assert.equal(f.rows.size, 0);
  assert.equal(f.vectors.size, 0);
});

test("finalization during vector write removes only the late live point", async () => {
  const f = fixture();
  f.vectors.set("canonical-id", [3, 4]);
  f.writer.upsertVector = async (item, vector) => {
    f.vectors.set(item.id, vector);
    f.state.active = false;
  };
  await storeLiveTranscript(chunk, f.writer);
  assert.equal(f.rows.size, 0);
  assert.deepEqual([...f.vectors.keys()], ["canonical-id"]);
});

test("finalization during the database write removes the late transcript row", async () => {
  const f = fixture();
  f.writer.saveChunk = async (item) => { f.rows.set(item.id, item); f.state.active = false; };
  await storeLiveTranscript(chunk, f.writer);
  assert.equal(f.rows.size, 0);
  assert.equal(f.vectors.size, 0);
});

function source(id: string): RetrievedChunk {
  return { id, meetingId: "meeting", speaker: null, startMs: 0, endMs: 1, text: id, score: 0.5 };
}

test("hybrid retrieval promotes shared evidence, deduplicates sources, and honors the limit", () => {
  const results = fuseCandidates([source("dense"), source("shared")], [source("keyword"), source("shared")], 2);
  assert.equal(results[0].id, "shared");
  assert.equal(results.length, 2);
  assert.equal(new Set(results.map((item) => item.id)).size, 2);
  assert.deepEqual(fuseCandidates([], [], 8), []);
});

function meeting(id: string, date: string, status = "done"): ScopedMeeting {
  return { id, title: id, endedAt: new Date(date), scheduledStart: null,
    createdAt: new Date(date), status, summary: null, actionItems: null };
}

test("latest-meeting selection excludes unfinished meetings and orders by date", () => {
  const meetings = [meeting("old", "2026-01-01"), meeting("live", "2026-01-04", "joining"),
    meeting("new", "2026-01-03"), meeting("middle", "2026-01-02")];
  assert.deepEqual(selectMeetingsForPlan(meetings, { meetingSelection: "latest_completed" }).map((item) => item.id), ["new"]);
  assert.deepEqual(selectMeetingsForPlan(meetings, { meetingSelection: "latest_two_completed" }).map((item) => item.id), ["new", "middle"]);
  assert.equal(selectMeetingsForPlan(meetings, { meetingSelection: "scope" }).length, 4);
  assert.equal(selectMeetingsForPlan([meetings[1]], { meetingSelection: "latest_completed" }).length, 0);
});

test("summary sampling covers both the beginning and the end of long transcripts", () => {
  const samples = sampleChronology(Array.from({ length: 100 }, (_, index) => index));
  assert.equal(samples.length, 18);
  assert.equal(samples[0], 0);
  assert.equal(samples.at(-1), 99);
  assert.equal(new Set(samples).size, 18);
  assert.deepEqual(sampleChronology([1, 2, 3]), [1, 2, 3]);
});
