-- Migration: Add phone number fields for alternate contacts
-- This migration adds phone number columns to the existing clients table for alternate contacts

-- Add phone number fields for alternate contacts
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_1_phone VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_2_phone VARCHAR(50);

-- Create indexes for better query performance on new phone fields
CREATE INDEX IF NOT EXISTS idx_clients_contact_1_phone ON clients(contact_1_phone);
CREATE INDEX IF NOT EXISTS idx_clients_contact_2_phone ON clients(contact_2_phone);

-- Add comments for documentation
COMMENT ON COLUMN clients.contact_1_phone IS 'Phone number for alternate contact 1';
COMMENT ON COLUMN clients.contact_2_phone IS 'Phone number for alternate contact 2';

-- Update the search functions to include new phone fields
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
    contact_1_phone TEXT,
    contact_2 TEXT,
    relationship_2 TEXT,
    contact_2_phone TEXT,
    notes TEXT,
    arrested BOOLEAN,
    charges TEXT,
    served_papers_or_initial_filing TEXT,
    case_type TEXT,
    court_date DATE,
    quoted DECIMAL(10,2),
    initial_payment DECIMAL(10,2),
    due_date_balance DATE,
    children_details TEXT,
    previous_court_orders BOOLEAN,
    other_side_name TEXT,
    other_side_relation TEXT,
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
        c.contact_1_phone,
        c.contact_2,
        c.relationship_2,
        c.contact_2_phone,
        c.notes,
        c.arrested,
        c.charges,
        c.served_papers_or_initial_filing,
        c.case_type,
        c.court_date,
        c.quoted,
        c.initial_payment,
        c.due_date_balance,
        c.children_details,
        c.previous_court_orders,
        c.other_side_name,
        c.other_side_relation,
        c.other_side_represented_by_attorney,
        c.other_side_contact_info,
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
        -- Or exact alternate contact phone match
        OR (c.contact_1_phone IS NOT NULL AND LOWER(c.contact_1_phone) = LOWER(search_query))
        OR (c.contact_2_phone IS NOT NULL AND LOWER(c.contact_2_phone) = LOWER(search_query))
        -- Or fuzzy name match with high similarity (only if no exact match found)
        OR (c.client_name IS NOT NULL AND similarity(c.client_name, search_query) > similarity_threshold)
        -- Or email match
        OR (c.email IS NOT NULL AND similarity(c.email, search_query) > similarity_threshold)
        -- Or phone match
        OR (c.phone IS NOT NULL AND similarity(c.phone, search_query) > similarity_threshold)
        -- Or alternate contact phone match
        OR (c.contact_1_phone IS NOT NULL AND similarity(c.contact_1_phone, search_query) > similarity_threshold)
        OR (c.contact_2_phone IS NOT NULL AND similarity(c.contact_2_phone, search_query) > similarity_threshold)
        -- Or contact match
        OR (c.contact_1 IS NOT NULL AND similarity(c.contact_1, search_query) > similarity_threshold)
        OR (c.contact_2 IS NOT NULL AND similarity(c.contact_2, search_query) > similarity_threshold)
        -- Or address contains the search term
        OR (c.address IS NOT NULL AND LOWER(c.address) LIKE '%' || LOWER(search_query) || '%')
        -- Or county match
        OR (c.county IS NOT NULL AND LOWER(c.county) LIKE '%' || LOWER(search_query) || '%')
        -- Or case type match (civil clients)
        OR (c.case_type IS NOT NULL AND LOWER(c.case_type) LIKE '%' || LOWER(search_query) || '%')
        -- Or charges match ( criminal clients)
        OR (c.charges IS NOT NULL AND LOWER(c.charges) LIKE '%' || LOWER(search_query) || '%')
        -- Or children details match
        OR (c.children_details IS NOT NULL AND LOWER(c.children_details) LIKE '%' || LOWER(search_query) || '%')
        -- Or other side name match
        OR (c.other_side_name IS NOT NULL AND LOWER(c.other_side_name) LIKE '%' || LOWER(search_query) || '%')
        -- Or other side relation match
        OR (c.other_side_relation IS NOT NULL AND LOWER(c.other_side_relation) LIKE '%' || LOWER(search_query) || '%')
    ORDER BY
        -- Prioritize exact matches first
        CASE
            WHEN LOWER(c.client_name) = LOWER(search_query) THEN 1
            WHEN LOWER(c.email) = LOWER(search_query) THEN 2
            WHEN LOWER(c.phone) = LOWER(search_query) THEN 3
            WHEN LOWER(c.contact_1_phone) = LOWER(search_query) THEN 4
            WHEN LOWER(c.contact_2_phone) = LOWER(search_query) THEN 5
            WHEN c.client_name IS NOT NULL AND similarity(c.client_name, search_query) > 0.8 THEN 6
            ELSE 7
        END,
        -- Then by name alphabetically for same priority matches
        c.client_name
    LIMIT max_results;
END;
$$;

-- Update the basic search function to include new phone fields
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
    contact_1_phone TEXT,
    contact_2 TEXT,
    relationship_2 TEXT,
    contact_2_phone TEXT,
    notes TEXT,
    arrested BOOLEAN,
    charges TEXT,
    served_papers_or_initial_filing TEXT,
    case_type TEXT,
    court_date DATE,
    quoted DECIMAL(10,2),
    initial_payment DECIMAL(10,2),
    due_date_balance DATE,
    children_details TEXT,
    previous_court_orders BOOLEAN,
    other_side_name TEXT,
    other_side_relation TEXT,
    other_side_represented_by_attorney BOOLEAN,
    other_side_contact_info TEXT,
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
        c.contact_1_phone,
        c.contact_2,
        c.relationship_2,
        c.contact_2_phone,
        c.notes,
        c.arrested,
        c.charges,
        c.served_papers_or_initial_filing,
        c.case_type,
        c.court_date,
        c.quoted,
        c.initial_payment,
        c.due_date_balance,
        c.children_details,
        c.previous_court_orders,
        c.other_side_name,
        c.other_side_relation,
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
        -- Or alternate contact phone matching
        OR (c.contact_1_phone IS NOT NULL AND LOWER(c.contact_1_phone) LIKE '%' || LOWER(search_query) || '%')
        OR (c.contact_2_phone IS NOT NULL AND LOWER(c.contact_2_phone) LIKE '%' || LOWER(search_query) || '%')
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
        -- Or children details matching
        OR (c.children_details IS NOT NULL AND LOWER(c.children_details) LIKE '%' || LOWER(search_query) || '%')
        -- Or other side name matching
        OR (c.other_side_name IS NOT NULL AND LOWER(c.other_side_name) LIKE '%' || LOWER(search_query) || '%')
        -- Or other side relation matching
        OR (c.other_side_relation IS NOT NULL AND LOWER(c.other_side_relation) LIKE '%' || LOWER(search_query) || '%')
        -- Or other side contact info matching
        OR (c.other_side_contact_info IS NOT NULL AND LOWER(c.other_side_contact_info) LIKE '%' || LOWER(search_query) || '%')
        -- Or notes matching
        OR (c.notes IS NOT NULL AND LOWER(c.notes) LIKE '%' || LOWER(search_query) || '%')
    ORDER BY
        -- Prioritize exact matches first
        CASE
            WHEN LOWER(c.client_name) = LOWER(search_query) THEN 1
            WHEN LOWER(c.client_name) LIKE LOWER(search_query) || '%' THEN 2
            WHEN LOWER(search_query) = LOWER(c.email) THEN 3
            WHEN LOWER(search_query) = LOWER(c.phone) THEN 4
            ELSE 5
        END,
        c.client_name
    LIMIT max_results;
END;
$$;