CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"markdown" text NOT NULL,
	"default_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_trip_sha_idx" ON "attachments" USING btree ("trip_id","sha256");--> statement-breakpoint
INSERT INTO "card_templates" ("name", "type", "markdown", "default_fields", "sort_order") VALUES
('Lot', 'transport', E'## Lot\n\n- numer lotu: \n- trasa: \n- terminal: \n- odprawa do: \n- miejsce: \n- bagaż: \n- rezerwacja: ', '{"remindMin": 180, "status": "booked"}', 10),
('Pociąg / autobus', 'transport', E'## Pociąg\n\n- numer: \n- trasa: \n- wagon: \n- miejsce: \n- bilet: ', '{"remindMin": 60, "status": "booked"}', 20),
('Nocleg', 'stay', E'## Nocleg\n\n- check-in od: \n- check-out do: \n- kod do drzwi: \n- kontakt: \n- rezerwacja: ', '{"remindMin": 120, "status": "booked"}', 30),
('Wynajem auta', 'transport', E'## Wynajem auta\n\n- odbiór: \n- zwrot: \n- rezerwacja: \n- ubezpieczenie: \n- paliwo: ', '{"remindMin": 120, "status": "booked"}', 40),
('Restauracja', 'food', E'## Restauracja\n\n- rezerwacja na: \n- osoby: \n- telefon: ', '{"remindMin": 60, "status": "booked"}', 50),
('Bilet wstępu', 'sight', E'## Bilet wstępu\n\n- wejście o: \n- numer biletu: \n- które wejście: ', '{"remindMin": 60, "status": "booked"}', 60);
