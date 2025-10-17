-- Migration: Add children-related fields to clients table
-- This migration adds fields for tracking children involved in custody cases

-- Add children_involved boolean field
ALTER TABLE clients ADD COLUMN IF NOT EXISTS children_involved BOOLEAN;

-- Add children_details text field for storing details about children
ALTER TABLE clients ADD COLUMN IF NOT EXISTS children_details TEXT;

-- Add previous_court_orders boolean field
ALTER TABLE clients ADD COLUMN IF NOT EXISTS previous_court_orders BOOLEAN;

-- Create indexes for better query performance on new fields
CREATE INDEX IF NOT EXISTS idx_clients_children_involved ON clients(children_involved);
CREATE INDEX IF NOT EXISTS idx_clients_previous_court_orders ON clients(previous_court_orders);

-- Add comments for documentation
COMMENT ON COLUMN clients.children_involved IS 'Whether the case involves children/custody issues';
COMMENT ON COLUMN clients.children_details IS 'Details about children including names, DOBs, and custody arrangements';
COMMENT ON COLUMN clients.previous_court_orders IS 'Whether there are previous court orders related to custody';