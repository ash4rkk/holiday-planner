CREATE TABLE "leave_alerts" (
	"key" text PRIMARY KEY NOT NULL,
	"alerted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes_daily" (
	"day" text PRIMARY KEY NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL
);
