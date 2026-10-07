import assert from "node:assert/strict";
import test from "node:test";
import { parseMeetingCitation } from "../lib/meeting-citations";

test("extracts the meeting and source excerpt from generated citations", () => {
  assert.deepEqual(parseMeetingCitation("/meetings/meeting-a?source=chunk-b"), {
    meetingId: "meeting-a",
    chunkId: "chunk-b",
  });
});

test("decodes citation identifiers and tolerates other query parameters", () => {
  assert.deepEqual(
    parseMeetingCitation("/meetings/team%20sync?view=notes&source=chunk%2B1"),
    {
      meetingId: "team sync",
      chunkId: "chunk+1",
    },
  );
});

test("does not intercept unrelated or external links as playback citations", () => {
  for (const href of [
    undefined,
    "/meetings/example",
    "/meetings/example?source=",
    "/meetings/a/export?source=b",
    "https://example.com/meetings/a?source=b",
    "//example.com/meetings/a?source=b",
    "javascript:alert(1)",
    "/meetings/%ZZ?source=b",
  ]) {
    assert.equal(parseMeetingCitation(href), null);
  }
});
