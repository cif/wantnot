ALTER TABLE "accounts" ADD COLUMN "transactions_cursor" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "pending_transaction_id" text;