CREATE TABLE IF NOT EXISTS "account_balance_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"current_balance" numeric(12, 2),
	"available_balance" numeric(12, 2),
	"taken_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_balance_snapshots" ADD CONSTRAINT "account_balance_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
