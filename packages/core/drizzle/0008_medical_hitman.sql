CREATE TABLE "route_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"plan" jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"alerted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "travel_mode" text DEFAULT 'transit' NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "travel_buffer_min" integer DEFAULT 10 NOT NULL;