CREATE TABLE "landing_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"audience" text NOT NULL,
	"locale" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
