-- Supports the lexical half of hybrid RAG and source-neighbour expansion.
CREATE INDEX "transcript_chunks_search_idx"
  ON "transcript_chunks"
  USING gin (to_tsvector('simple', "text"));
--> statement-breakpoint
CREATE INDEX "transcript_chunks_meeting_start_idx"
  ON "transcript_chunks" ("meeting_id", "start_ms");
