-- Fix for client search issue - only run these commands
-- This updates the search functions to match current clients table schema

-- Drop existing functions if they exist (to avoid conflicts)
DROP FUNCTION IF EXISTS search_clients_precise(TEXT, FLOAT, INTEGER);
DROP FUNCTION IF EXISTS search_clients_basic(TEXT, INTEGER);

-- Create updated precise search function that matches current schema
CREATE OR REPLACE FUNCTION search_clients_precise(
    search_query TEXT,
    similarity_threshold FLOAT DEFAULT 0.3,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    client_name TEXT,
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
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.client_name,
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
        -- Or fuzzy name match with similarity threshold
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

-- Create updated basic search function that matches current schema
CREATE OR REPLACE FUNCTION search_clients_basic(
    search_query TEXT,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    client_name TEXT,
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

-- Add test client for Todd Jones (only if it doesn't exist)
INSERT INTO clients (client_name, client_type, date_intake, date_of_birth, address, phone, email, contact_1, relationship_1, contact_2, relationship_2, notes, county, arrested, charges, court_date, quoted, initial_payment, due_date_balance)
SELECT 'Todd Jones', 'criminal', '2025-09-20', '1982-03-15', '123 Oak Street, Springfield, IL 62701', '2175550123', 'todd.jones@email.com', 'Mary Jones', 'Wife', 'John Jones', 'Brother', 'Test client for partial name search functionality', 'Sangamon County', true, 'Theft, Burglary', '2025-11-05', '3500.00', '700.00', '2025-10-25'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE client_name = 'Todd Jones');

-- Verification: Check if Todd Jones exists
-- SELECT client_name FROM clients WHERE client_name ILIKE '%Todd%';