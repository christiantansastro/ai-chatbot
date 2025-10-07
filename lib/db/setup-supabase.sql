-- Supabase Database Setup Script
-- Run this in your Supabase SQL Editor to create/update the necessary tables
-- This script will create the correct table structure for the updated adapter

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable trigram extension for fuzzy text matching (optional)
-- Note: If you get permission errors, you can skip this and use basic text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    user_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create chats table
CREATE TABLE IF NOT EXISTS chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    visibility TEXT CHECK (visibility IN ('public', 'private')) DEFAULT 'private',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraint after table creation to avoid issues
ALTER TABLE chats ADD CONSTRAINT chats_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('user', 'assistant', 'system')) NOT NULL,
    parts JSONB NOT NULL DEFAULT '[]',
    attachments JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
);

-- Create votes table
CREATE TABLE IF NOT EXISTS votes (
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    message_id UUID NOT NULL,
    is_upvoted BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (chat_id, message_id)
);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT,
    kind TEXT CHECK (kind IN ('text', 'code', 'image', 'sheet')) DEFAULT 'text',
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
);

-- Update the documents table to allow financial-statement kind (if it already exists)
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_kind_check;
ALTER TABLE documents ADD CONSTRAINT documents_kind_check
    CHECK (kind IN ('text', 'code', 'image', 'sheet', 'financial-statement'));

-- Create suggestions table
CREATE TABLE IF NOT EXISTS suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL,
    document_created_at TIMESTAMPTZ NOT NULL,
    original_text TEXT NOT NULL,
    suggested_text TEXT NOT NULL,
    description TEXT,
    is_resolved BOOLEAN DEFAULT FALSE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (document_id, document_created_at) REFERENCES documents(id, created_at)
);

-- Create streams table
CREATE TABLE IF NOT EXISTS streams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_name TEXT NOT NULL,
    client_type TEXT CHECK (client_type IN ('criminal', 'civil')),
    date_intake DATE NOT NULL DEFAULT CURRENT_DATE,
    date_of_birth DATE,
    address TEXT,
    phone TEXT,
    email TEXT,
    contact_1 TEXT,
    relationship_1 TEXT,
    contact_2 TEXT,
    relationship_2 TEXT,
    notes TEXT,
    -- Common fields for both client types
    county TEXT,
    court_date DATE,
    quoted DECIMAL(10,2),
    initial_payment DECIMAL(10,2),
    due_date_balance DATE,
    -- Criminal-specific fields
    arrested BOOLEAN,
    charges TEXT,
    -- Civil-specific fields
    served_papers_or_initial_filing TEXT,
    case_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id_created_at ON messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user_created_at ON documents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suggestions_document_id ON suggestions(document_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_document_created_at ON suggestions(document_id, document_created_at);
CREATE INDEX IF NOT EXISTS idx_votes_chat_id ON votes(chat_id);
CREATE INDEX IF NOT EXISTS idx_votes_message_id ON votes(message_id);
CREATE INDEX IF NOT EXISTS idx_clients_client_name ON clients(client_name);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_contact_1 ON clients(contact_1);
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_clients_county ON clients(county);
CREATE INDEX IF NOT EXISTS idx_clients_arrested ON clients(arrested);
CREATE INDEX IF NOT EXISTS idx_clients_case_type ON clients(case_type);
CREATE INDEX IF NOT EXISTS idx_clients_court_date ON clients(court_date);
CREATE INDEX IF NOT EXISTS idx_clients_due_date_balance ON clients(due_date_balance);

-- Create GIN indexes for full-text search and trigram matching
CREATE INDEX IF NOT EXISTS idx_clients_search ON clients USING GIN (
    to_tsvector('english', client_name || ' ' || COALESCE(email, '') || ' ' || COALESCE(phone, '') || ' ' || COALESCE(contact_1, '') || ' ' || COALESCE(address, '') || ' ' || COALESCE(county, '') || ' ' || COALESCE(case_type, '') || ' ' || COALESCE(charges, ''))
);

-- Create trigram indexes for fuzzy matching (with explicit operator classes)
CREATE INDEX IF NOT EXISTS idx_clients_client_name_trgm ON clients USING GIN (client_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_email_trgm ON clients USING GIN (COALESCE(email, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_phone_trgm ON clients USING GIN (COALESCE(phone, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_contact_1_trgm ON clients USING GIN (COALESCE(contact_1, '') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_streams_chat_id ON streams(chat_id);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE streams ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user isolation
-- Users can only access their own data
CREATE POLICY "Users can view own data" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Allow users to insert their own data (for registration)
CREATE POLICY "Users can insert own data" ON users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow service role to insert any user data (for admin operations)
CREATE POLICY "Service role can insert any user" ON users
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view own chats" ON chats
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chats" ON chats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chats" ON chats
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chats" ON chats
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view messages in own chats" ON messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chats
            WHERE chats.id = messages.chat_id
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages in own chats" ON messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM chats
            WHERE chats.id = messages.chat_id
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update messages in own chats" ON messages
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM chats
            WHERE chats.id = messages.chat_id
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete messages in own chats" ON messages
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM chats
            WHERE chats.id = messages.chat_id
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view own documents" ON documents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents" ON documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents" ON documents
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents" ON documents
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view votes in own chats" ON votes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chats
            WHERE chats.id = votes.chat_id
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert votes in own chats" ON votes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM chats
            WHERE chats.id = votes.chat_id
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update votes in own chats" ON votes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM chats
            WHERE chats.id = votes.chat_id
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete votes in own chats" ON votes
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM chats
            WHERE chats.id = votes.chat_id
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view own suggestions" ON suggestions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own suggestions" ON suggestions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own suggestions" ON suggestions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own suggestions" ON suggestions
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view all clients" ON clients
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert clients" ON clients
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update clients" ON clients
    FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete clients" ON clients
    FOR DELETE USING (auth.uid() IS NOT NULL);

-- Enable RLS on financials table
ALTER TABLE financials ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for financials table
CREATE POLICY "Users can view all financial records" ON financials
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert financial records" ON financials
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update financial records" ON financials
    FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete financial records" ON financials
    FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create a function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Migration: Handle existing messages table with old structure
-- If you have an existing messages table with 'content' column, run this migration:
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS parts JSONB DEFAULT '[]';
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
-- UPDATE messages SET parts = content->'parts', attachments = content->'attachments' WHERE content IS NOT NULL;
-- ALTER TABLE messages DROP COLUMN content;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for financials table
CREATE TRIGGER update_financials_updated_at BEFORE UPDATE ON financials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create a function for precise client searching (requires pg_trgm extension)
CREATE OR REPLACE FUNCTION search_clients_precise(
    search_query TEXT,
    similarity_threshold FLOAT DEFAULT 0.6,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    client_name TEXT,
    date_intake DATE NOT NULL DEFAULT CURRENT_DATE,
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

-- Create a basic search function that works without pg_trgm extension
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

-- Insert some sample client data for testing (only if table is empty)
-- Criminal client example
INSERT INTO clients (client_name, client_type, date_of_birth, address, phone, email, contact_1, relationship_1, contact_2, relationship_2, notes, county, arrested, charges, court_date, quoted, initial_payment, due_date_balance)
SELECT 'John Smith', 'criminal', '2025-09-01', '1988-09-01', '123 Main St, City, State 12345', '012345678', 'john.smith@email.com', 'Jane Smith', 'Spouse', NULL, NULL, 'Key account manager, prefers morning meetings', 'Cook County', true, 'DUI, Reckless Driving', '2025-10-15', '2500.00', '500.00', '2025-10-30'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE client_name = 'John Smith');

-- Civil client example
INSERT INTO clients (client_name, client_type, date_intake, date_of_birth, address, phone, email, contact_1, relationship_1, contact_2, relationship_2, notes, county, served_papers_or_initial_filing, case_type, court_date, quoted, initial_payment, due_date_balance)
SELECT 'Sarah Johnson', 'civil', '2025-08-15', '1990-03-15', '456 Tech Ave, Silicon Valley, CA 94043', '098765432', 'sarah.j@techstart.io', 'Mike Johnson', 'Partner', NULL, NULL, 'Startup founder, very responsive to emails', 'Santa Clara County', 'Initial filing', 'Business Contract Dispute', '2025-11-20', '3500.00', '1000.00', '2025-11-15'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE client_name = 'Sarah Johnson');

INSERT INTO clients (client_name, client_type, date_intake, date_of_birth, address, phone, email, contact_1, relationship_1, contact_2, relationship_2, notes, county, served_papers_or_initial_filing, case_type, court_date, quoted, initial_payment, due_date_balance)
SELECT 'Michael Brown', 'criminal', '2025-09-10', '1985-11-22', '789 Business Blvd, Downtown, NY 10001', '555666777', 'mbrown@consulting.com', 'Sarah Brown', 'Wife', NULL, NULL, 'Potential high-value client, needs follow-up', 'New York County', false, 'Embezzlement, Fraud', '2025-12-01', '7500.00', '2000.00', '2025-11-25'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE client_name = 'Michael Brown');

INSERT INTO clients (client_name, client_type, date_intake, date_of_birth, address, phone, email, contact_1, relationship_1, contact_2, relationship_2, notes, county, served_papers_or_initial_filing, case_type, court_date, quoted, initial_payment, due_date_balance)
SELECT 'Emily Davis', 'civil', '2025-07-20', '1992-05-10', '321 Industrial Rd, Manufacturing District, IL 60601', '111222333', 'emily.davis@manufacturing.com', 'Robert Davis', 'Husband', NULL, NULL, 'Temporarily paused projects, check back in Q2', 'Cook County', 'Served papers', 'Divorce', '2025-10-25', '5000.00', '1500.00', '2025-10-20'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE client_name = 'Emily Davis');

INSERT INTO clients (client_name, client_type, date_of_birth, address, phone, email, contact_1, relationship_1, contact_2, relationship_2, notes, county, arrested, charges, court_date, quoted, initial_payment, due_date_balance)
SELECT 'Robert Wilson', ' criminal', '2025-09-05', '1978-12-03', '654 Retail Plaza, Shopping Center, TX 75001', '444555666', 'rwilson@retailplus.com', 'Mary Wilson', 'Wife', NULL, NULL, 'Prefers phone calls over email', 'Dallas County', true, 'Assault, Battery', '2025-11-10', '3000.00', '750.00', '2025-11-05'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE client_name = 'Robert Wilson');

INSERT INTO clients (client_name, client_type, date_intake, date_of_birth, address, phone, email, contact_1, relationship_1, contact_2, relationship_2, notes, county, served_papers_or_initial_filing, case_type, court_date, quoted, initial_payment, due_date_balance)
SELECT 'Lisa Anderson', 'civil', '2025-08-28', '1987-07-18', '987 Design Studio St, Arts District, CA 90210', '777888999', 'lisa@designstudio.com', 'Tom Anderson', 'Husband', NULL, NULL, 'Creative professional, values detailed proposals', 'Los Angeles County', 'Initial filing', 'Child Custody', '2025-12-15', '4000.00', '1200.00', '2025-12-10'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE client_name = 'Lisa Anderson');
