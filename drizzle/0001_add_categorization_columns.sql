-- Add auto-categorization columns to existing transactions table
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS auto_categorization_method text,
ADD COLUMN IF NOT EXISTS auto_categorization_confidence real;
