-- Migration: Add other side contact and attorney fields for civil cases
-- This migration adds fields for tracking opposing party representation and contact info

-- Add other_side_represented_by_attorney field
ALTER TABLE clients ADD COLUMN IF NOT EXISTS other_side_represented_by_attorney BOOLEAN;

-- Add other_side_contact_info field for storing contact information
ALTER TABLE clients ADD COLUMN IF NOT EXISTS other_side_contact_info TEXT;

-- Create indexes for better query performance on new fields
CREATE INDEX IF NOT EXISTS idx_clients_other_side_represented_by_attorney ON clients(other_side_represented_by_attorney);

-- Add comments for documentation
COMMENT ON COLUMN clients.other_side_represented_by_attorney IS 'Whether the opposing party is represented by an attorney';
COMMENT ON COLUMN clients.other_side_contact_info IS 'Contact information for the opposing party (disabled when represented by attorney)';