-- Migration: Add client type fields to support criminal and civil clients
-- This migration adds new columns to the existing clients table to support both client types

-- Add client_type column (enum: 'criminal', 'civil')
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type TEXT CHECK (client_type IN ('criminal', 'civil'));

-- Add county field (common to both client types)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS county TEXT;

-- Set default value for date_intake and make it NOT NULL
-- First, update any existing NULL values to today's date
UPDATE clients SET date_intake = CURRENT_DATE WHERE date_intake IS NULL;

-- Then alter the column to be NOT NULL with default
ALTER TABLE clients ALTER COLUMN date_intake SET NOT NULL;
ALTER TABLE clients ALTER COLUMN date_intake SET DEFAULT CURRENT_DATE;

-- Add criminal-specific fields
ALTER TABLE clients ADD COLUMN IF NOT EXISTS arrested BOOLEAN;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS charges TEXT;

-- Add civil-specific fields
ALTER TABLE clients ADD COLUMN IF NOT EXISTS served_papers_or_initial_filing TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS case_type TEXT;

-- Add financial fields (common to both client types)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS court_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS quoted DECIMAL(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS initial_payment DECIMAL(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS due_date_balance DATE;

-- Create indexes for better query performance on new fields
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_clients_county ON clients(county);
CREATE INDEX IF NOT EXISTS idx_clients_arrested ON clients(arrested);
CREATE INDEX IF NOT EXISTS idx_clients_case_type ON clients(case_type);
CREATE INDEX IF NOT EXISTS idx_clients_court_date ON clients(court_date);
CREATE INDEX IF NOT EXISTS idx_clients_due_date_balance ON clients(due_date_balance);

-- Add comments for documentation
COMMENT ON COLUMN clients.client_type IS 'Client type: criminal or civil';
COMMENT ON COLUMN clients.county IS 'County where legal issues are located';
COMMENT ON COLUMN clients.arrested IS 'Whether criminal client was arrested (criminal clients only)';
COMMENT ON COLUMN clients.charges IS 'Criminal charges (criminal clients only)';
COMMENT ON COLUMN clients.served_papers_or_initial_filing IS 'Whether civil client was served papers or this is initial filing (civil clients only)';
COMMENT ON COLUMN clients.case_type IS 'Type of civil case (divorce, custody, etc.) (civil clients only)';
COMMENT ON COLUMN clients.court_date IS 'Scheduled court date (optional for both types)';
COMMENT ON COLUMN clients.quoted IS 'Quoted amount for services';
COMMENT ON COLUMN clients.initial_payment IS 'Initial payment amount received';
COMMENT ON COLUMN clients.due_date_balance IS 'Due date for remaining balance';

-- Update the search function to include new fields
CREATE OR REPLACE FUNCTION search_clients_precise(
    search_query TEXT,
    similarity_threshold FLOAT DEFAULT 0.6,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    client_name TEXT,
    client_type TEXT,
    county TEXT,
    date_intake DATE,
    date_of_birth DATE,
    address TEXT,
    phone TEXT,
    email TEXT,
    contact_1 TEXT,
    relationship_1 TEXT,
    contact_2 TEXT,
    relationship_2 TEXT,
    notes TEXT,
    arrested BOOLEAN,
    charges TEXT,
    served_papers_or_initial_filing TEXT,
    case_type TEXT,
    court_date DATE,
    quoted DECIMAL(10,2),
    initial_payment DECIMAL(10,2),
    due_date_balance DATE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.client_name,
        c.client_type,
        c.county,
        c.date_intake,
        c.date_of_birth,
        c.address,
        c.phone,
        c.email,
        c.contact_1,
        c.relationship_1,
        c.contact_2,
        c.relationship_2,
        c.notes,
        c.arrested,
        c.charges,
        c.served_papers_or_initial_filing,
        c.case_type,
        c.court_date,
        c.quoted,
        c.initial_payment,
        c.due_date_balance,
        c.created_at,
        c.updated_at
    FROM clients c
    WHERE
        -- Exact name match (highest priority) - case insensitive
        (c.client_name IS NOT NULL AND LOWER(c.client_name) = LOWER(search_query))
        -- Or exact email match
        OR (c.email IS NOT NULL AND LOWER(c.email) = LOWER(search_query))
        -- Or exact phone match
        OR (c.phone IS NOT NULL AND LOWER(c.phone) = LOWER(search_query))
        -- Or fuzzy name match with high similarity (only if no exact match found)
        OR (c.client_name IS NOT NULL AND similarity(c.client_name, search_query) > similarity_threshold)
        -- Or email match
        OR (c.email IS NOT NULL AND similarity(c.email, search_query) > similarity_threshold)
        -- Or phone match
        OR (c.phone IS NOT NULL AND similarity(c.phone, search_query) > similarity_threshold)
        -- Or contact match
        OR (c.contact_1 IS NOT NULL AND similarity(c.contact_1, search_query) > similarity_threshold)
        OR (c.contact_2 IS NOT NULL AND similarity(c.contact_2, search_query) > similarity_threshold)
        -- Or address contains the search term
        OR (c.address IS NOT NULL AND LOWER(c.address) LIKE '%' || LOWER(search_query) || '%')
        -- Or county match
        OR (c.county IS NOT NULL AND LOWER(c.county) LIKE '%' || LOWER(search_query) || '%')
        -- Or case type match (civil clients)
        OR (c.case_type IS NOT NULL AND LOWER(c.case_type) LIKE '%' || LOWER(search_query) || '%')
        -- Or charges match (criminal clients)
        OR (c.charges IS NOT NULL AND LOWER(c.charges) LIKE '%' || LOWER(search_query) || '%')
    ORDER BY
        -- Prioritize exact matches first
        CASE
            WHEN LOWER(c.client_name) = LOWER(search_query) THEN 1
            WHEN LOWER(c.email) = LOWER(search_query) THEN 2
            WHEN LOWER(c.phone) = LOWER(search_query) THEN 3
            WHEN c.client_name IS NOT NULL AND similarity(c.client_name, search_query) > 0.8 THEN 4
            ELSE 5
        END,
        -- Then by name alphabetically for same priority matches
        c.client_name
    LIMIT max_results;
END;
$$;

-- Update the basic search function to include new fields
CREATE OR REPLACE FUNCTION search_clients_basic(
    search_query TEXT,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    client_name TEXT,
    client_type TEXT,
    county TEXT,
    date_intake DATE,
    date_of_birth DATE,
    address TEXT,
    phone TEXT,
    email TEXT,
    contact_1 TEXT,
    relationship_1 TEXT,
    contact_2 TEXT,
    relationship_2 TEXT,
    notes TEXT,
    arrested BOOLEAN,
    charges TEXT,
    served_papers_or_initial_filing TEXT,
    case_type TEXT,
    court_date DATE,
    quoted DECIMAL(10,2),
    initial_payment DECIMAL(10,2),
    due_date_balance DATE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.client_name,
        c.client_type,
        c.county,
        c.date_intake,
        c.date_of_birth,
        c.address,
        c.phone,
        c.email,
        c.contact_1,
        c.relationship_1,
        c.contact_2,
        c.relationship_2,
        c.notes,
        c.arrested,
        c.charges,
        c.served_papers_or_initial_filing,
        c.case_type,
        c.court_date,
        c.quoted,
        c.initial_payment,
        c.due_date_balance,
        c.created_at,
        c.updated_at
    FROM clients c
    WHERE
        -- Basic text matching (case-insensitive)
        (c.client_name IS NOT NULL AND LOWER(c.client_name) LIKE '%' || LOWER(search_query) || '%')
        -- Or email matching
        OR (c.email IS NOT NULL AND LOWER(c.email) LIKE '%' || LOWER(search_query) || '%')
        -- Or phone matching
        OR (c.phone IS NOT NULL AND LOWER(c.phone) LIKE '%' || LOWER(search_query) || '%')
        -- Or contact matching
        OR (c.contact_1 IS NOT NULL AND LOWER(c.contact_1) LIKE '%' || LOWER(search_query) || '%')
        OR (c.contact_2 IS NOT NULL AND LOWER(c.contact_2) LIKE '%' || LOWER(search_query) || '%')
        -- Or address matching
        OR (c.address IS NOT NULL AND LOWER(c.address) LIKE '%' || LOWER(search_query) || '%')
        -- Or county matching
        OR (c.county IS NOT NULL AND LOWER(c.county) LIKE '%' || LOWER(search_query) || '%')
        -- Or case type matching (civil clients)
        OR (c.case_type IS NOT NULL AND LOWER(c.case_type) LIKE '%' || LOWER(search_query) || '%')
        -- Or charges matching ( criminal clients)
        OR (c.charges IS NOT NULL AND LOWER(c.charges) LIKE '%' || LOWER(search_query) || '%')
        -- Or notes matching
        OR (c.notes IS NOT NULL AND LOWER(c.notes) LIKE '%' || LOWER(search_query) || '%')
    ORDER BY
        -- Prioritize exact matches first
        CASE
            WHEN LOWER(c.client_name) = LOWER(search_query) THEN 1
            WHEN LOWER(c.client_name) LIKE LOWER(search_query) || '%' THEN 2
            WHEN LOWER(search_query) = LOWER(c.email) THEN 3
            ELSE 4
        END,
        c.client_name
    LIMIT max_results;
END;
$$;