import assert from "node:assert/strict";
import { test } from "node:test";
import { agendaDuration, filterAgenda, groupAgenda } from "../lib/calendar-agenda";

const event = (id: string, date: Date, scheduled = false) => ({ id, start_time: date.toISOString(), end_time: new Date(date.getTime() + 90 * 60000).toISOString(), title: id === "first" ? "Product review" : "Client sync", accountEmail: "team@example.com", bots: scheduled ? [{ bot_id: "bot" }] : [] });

test("groups by local calendar day across a month boundary and sorts without mutating", () => {
  const now = new Date(2026, 9, 31, 23, 50);
  const tomorrow = event("next", new Date(2026, 10, 1, 0, 10));
  const first = event("first", new Date(2026, 9, 31, 9, 0));
  const later = event("later", new Date(2026, 9, 31, 15, 0));
  const source = [tomorrow, later, first];
  const groups = groupAgenda(source, now);
  assert.deepEqual(groups.map((group) => group.label), ["Today", "Tomorrow"]);
  assert.deepEqual(groups[0].events.map((item) => item.id), ["first", "later"]);
  assert.deepEqual(source.map((item) => item.id), ["next", "later", "first"]);
});

test("filters scheduled and unscheduled meetings, and searches titles and accounts", () => {
  const items = [event("first", new Date(), true), event("second", new Date())];
  assert.deepEqual(filterAgenda(items, "scheduled", " product ").map((item) => item.id), ["first"]);
  assert.deepEqual(filterAgenda(items, "unscheduled", "TEAM@EXAMPLE").map((item) => item.id), ["second"]);
  assert.equal(filterAgenda(items, "all", "not found").length, 0);
  assert.equal(filterAgenda(items, "all", "").length, 2);
});

test("formats durations without showing invalid or negative values", () => {
  const start = "2026-10-07T10:00:00Z";
  assert.equal(agendaDuration(start, "2026-10-07T11:30:00Z"), "1h 30m");
  assert.equal(agendaDuration(start, "2026-10-07T10:25:00Z"), "25 min");
  assert.equal(agendaDuration(start, "2026-10-07T11:00:00Z"), "1h");
  assert.equal(agendaDuration(start, "2026-10-07T09:00:00Z"), null);
  assert.equal(agendaDuration(start, "invalid"), null);
});
