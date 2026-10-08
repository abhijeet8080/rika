ALTER TABLE "calendar_connections" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "cleanup_after" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "cleanup_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "cleanup_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "cleanup_error" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "cleanup_after" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "cleanup_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "cleanup_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "cleanup_error" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "calendar_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cleanup_after" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cleanup_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cleanup_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cleanup_error" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "retention_days" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clerk_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_calendar_connection_id_calendar_connections_id_fk" FOREIGN KEY ("calendar_connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connections_account_unique" ON "calendar_connections" USING btree ("user_id","provider","email","recall_account");