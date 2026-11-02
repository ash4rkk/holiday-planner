CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"maps_url" text,
	"note" text,
	"client_key" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "inbox_items_client_key_unique" UNIQUE("client_key")
);
--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_items_trip_idx" ON "inbox_items" USING btree ("trip_id","used_at");