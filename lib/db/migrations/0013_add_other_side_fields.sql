-- Migration: Add other side fields for civil cases
-- This migration adds fields for tracking the opposing party in civil cases

-- Add other_side_name field for storing the name of the opposing party
ALTER TABLE clients ADD COLUMN IF NOT EXISTS other_side_name VARCHAR(255);

-- Add other_side_relation field for storing the relationship to the opposing party
ALTER TABLE clients ADD COLUMN IF NOT EXISTS other_side_relation VARCHAR(255);

-- Create indexes for better query performance on new fields
CREATE INDEX IF NOT EXISTS idx_clients_other_side_name ON clients(other_side_name);
CREATE INDEX IF NOT EXISTS idx_clients_other_side_relation ON clients(other_side_relation);

-- Add comments for documentation
COMMENT ON COLUMN clients.other_side_name IS 'Name of the opposing party in civil cases';
COMMENT ON COLUMN clients.other_side_relation IS 'Relationship to the opposing party in civil cases';