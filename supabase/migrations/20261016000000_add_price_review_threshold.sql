-- Add price_review_threshold column to site_config if not exists
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS price_review_threshold NUMERIC DEFAULT 300;
