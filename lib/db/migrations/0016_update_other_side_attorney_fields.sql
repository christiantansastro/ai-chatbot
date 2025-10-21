-- Remove the old other_side_represented_by_attorney column
ALTER TABLE "Client" DROP COLUMN IF EXISTS "other_side_represented_by_attorney";

-- Add the new other_side_attorney_info column
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "other_side_attorney_info" text;