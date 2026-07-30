import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  // Nullable — pre-auth (Phase 1) rows get linked to a Clerk account on
  // first sign-in rather than migrated up front.
  clerkUserId: text("clerk_user_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const calendarConnections = pgTable("calendar_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  provider: text("provider").notNull(), // 'google' | 'microsoft_outlook'
  // The connected account's email — lets a user connect multiple accounts
  // per provider (e.g. personal + work Gmail) as distinct rows, deduped
  // on (userId, provider, email) rather than just (userId, provider).
  email: text("email"),
  recallCalendarId: text("recall_calendar_id").notNull(),
  status: text("status").notNull(), // 'connected' | 'disconnected' | 'error'
  // When on, every meeting synced from this connection gets a bot
  // scheduled automatically (via the calendar.sync_events webhook), no
  // manual "Record" click needed.
  autoRecord: boolean("auto_record").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  recallBotId: text("recall_bot_id").notNull().unique(),
  title: text("title"),
  platform: text("platform"), // 'zoom' | 'google_meet' | 'teams'
  meetingUrl: text("meeting_url").notNull(),
  calendarEventId: text("calendar_event_id"),
  scheduledStart: timestamp("scheduled_start", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  status: text("status").notNull(), // mirrors Recall bot lifecycle status
  recordingVideoUrl: text("recording_video_url"),
  recordingAudioUrl: text("recording_audio_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id),
  name: text("name"),
  email: text("email"),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  leftAt: timestamp("left_at", { withTimezone: true }),
});

// Text/metadata only — the embedding for each row lives in Qdrant's
// `transcript_chunks` collection, keyed by this same `id`.
export const transcriptChunks = pgTable("transcript_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id),
  speaker: text("speaker"),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
