-- Migration: Add unique constraint to client_name field
-- This migration ensures that client names are unique across all records

-- Add unique constraint to client_name column (only if it doesn't already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'clients_client_name_unique'
    ) THEN
        ALTER TABLE clients ADD CONSTRAINT clients_client_name_unique UNIQUE (client_name);
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON CONSTRAINT clients_client_name_unique ON clients IS 'Ensures client names are unique across all records';