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
CREATE INDEX IF NOT EXISTS idx_suggestions_document_created_at ON suggestions(document_id, document_created_at);
CREATE INDEX IF NOT EXISTS idx_clients_client_name ON clients(client_name);

-- Enable Row Level Security (RLS) for all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own chat" ON chats;
DROP POLICY IF EXISTS "Users can insert own chat" ON chats;
DROP POLICY IF EXISTS "Users can update own chat" ON chats;
DROP POLICY IF EXISTS "Users can delete own chat" ON chats;
DROP POLICY IF EXISTS "Users can view own messages" ON messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON messages;
DROP POLICY IF EXISTS "Users can view own documents" ON documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON documents;
DROP POLICY IF EXISTS "Users can update own documents" ON documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON documents;

-- RLS Policies for chats table
CREATE POLICY "Users can view own chat" ON chats
    FOR SELECT USING (chats.user_id = auth.uid());

CREATE POLICY "Users can insert own chat" ON chats
    FOR INSERT WITH CHECK (chats.user_id = auth.uid());

CREATE POLICY "Users can update own chat" ON chats
    FOR UPDATE USING (chats.user_id = auth.uid());

CREATE POLICY "Users can delete own chat" ON chats
    FOR DELETE USING (chats.user_id = auth.uid());

-- RLS Policies for messages table
CREATE POLICY "Users can view own messages" ON messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chats
            WHERE chats.id = messages.chat_id
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own messages" ON messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM chats
            WHERE chats.id = messages.chat_id
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own messages" ON messages
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM chats
            WHERE chats.id = messages.chat_id
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own messages" ON messages
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM chats
            WHERE chats.id = messages.chat_id
            AND chats.user_id = auth.uid()
        )
    );

-- RLS Policies for documents table
CREATE POLICY "Users can view own documents" ON documents
    FOR SELECT USING (documents.user_id = auth.uid());

CREATE POLICY "Users can insert own documents" ON documents
    FOR INSERT WITH CHECK (documents.user_id = auth.uid());

CREATE POLICY "Users can update own documents" ON documents
    FOR UPDATE USING (documents.user_id = auth.uid());

CREATE POLICY "Users can delete own documents" ON documents
    FOR DELETE USING (documents.user_id = auth.uid());

-- Sample users
INSERT INTO users (id, email, user_metadata) 
VALUES 
    ('12345678-1234-1234-1234-123456789012', 'demo@example.com', '{"name": "Demo User", "role": "demo"}')
ON CONFLICT (id) DO NOTHING;

-- Sample chats
INSERT INTO chats (id, user_id, title, visibility, created_at)
VALUES 
    ('abcdefab-1234-4567-8901-123456789012', '12345678-1234-1234-1234-123456789012', 'Demo Chat', 'public', NOW() - INTERVAL '1 hour'),
    ('bcdefabc-2345-5678-9012-234567890123', '12345678-1234-1234-1234-123456789012', 'Private Demo', 'private', NOW() - INTERVAL '2 hours')
ON CONFLICT (id) DO NOTHING;

-- Sample messages
INSERT INTO messages (id, chat_id, role, parts, attachments, created_at)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'abcdefab-1234-4567-8901-123456789012', 'user', '[{"type": "text", "text": "Hello, this is a demo message."}]', '[]', NOW() - INTERVAL '1 hour'),
    ('22222222-2222-2222-2222-222222222222', 'abcdefab-1234-4567-8901-123456789012', 'assistant', '[{"type": "text", "text": "Hello! This is a demo response from the chatbot."}]', '[]', NOW() - INTERVAL '1 hour' + INTERVAL '1 minute'),
    ('33333333-3333-3333-3333-333333333333', 'abcdefab-1234-4567-8901-123456789012', 'user', '[{"type": "text", "text": "Can you help me with something?"}]', '[]', NOW() - INTERVAL '45 minutes'),
    ('44444444-4444-4444-4444-444444444444', 'abcdefab-1234-4567-8901-123456789012', 'assistant', '[{"type": "text", "text": "Absolutely! I am here to help you with any questions or tasks you have."}]', '[]', NOW() - INTERVAL '45 minutes' + INTERVAL '30 seconds')
ON CONFLICT (id, created_at) DO NOTHING;

-- Sample documents
INSERT INTO documents (id, title, content, kind, user_id, created_at)
VALUES 
    ('aaaa1111-1111-1111-1111-111111111111', 'Demo Document', 'This is a sample document content.', 'text', '12345678-1234-1234-1234-123456789012', NOW() - INTERVAL '2 days'),
    ('bbbb2222-2222-2222-2222-222222222222', 'Sample Code', 'function hello() { return "Hello, world!"; }', 'code', '12345678-1234-1234-1234-123456789012', NOW() - INTERVAL '1 day'),
    ('cccc3333-3333-3333-3333-333333333333', 'Financial Report Q4 2023', 'Revenue: $1,000,000\nExpenses: $750,000\nNet Profit: $250,000', 'financial-statement', '12345678-1234-1234-1234-123456789012', NOW() - INTERVAL '3 hours')
ON CONFLICT (id, created_at) DO NOTHING;

-- Sample test clients for the legal firm CRM system
INSERT INTO clients (client_name, client_type, date_intake, date_of_birth, address, phone, email, contact_1, relationship_1, contact_2, relationship_2, notes, county, served_papers_or_initial_filing, case_type, court_date, quoted, initial_payment, due_date_balance)
SELECT 'John Smith', 'civil', '2025-09-15', '1988-12-05', '123 Main Street, Downtown, CA 90210', '555123456', 'john.smith@email.com', 'Jane Smith', 'Wife', NULL, NULL, 'New client, needs consultation on property dispute', 'Los Angeles County', 'Initial filing', 'Property Dispute', '2025-12-20', '2500.00', '500.00', '2025-12-01'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE client_name = 'John Smith');

INSERT INTO clients (client_name, client_type, date_intake, date_of_birth, address, phone, email, contact_1, relationship_1, contact_2, relationship_2, notes, county, arrested, charges, court_date, quoted, initial_payment, due_date_balance)
SELECT 'Maria Garcia', 'criminal', '2025-10-01', '1990-03-15', '456 Tech Ave, Silicon Valley, CA 94043', '098765432', 'maria.garcia@techstart.io', 'Carlos Garcia', 'Partner', NULL, NULL, 'Tech startup founder, very responsive to emails', 'Santa Clara County', false, 'Fraud, Embezzlement', '2025-11-20', '3500.00', '1000.00', '2025-11-15'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE client_name = 'Maria Garcia');

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

-- Test client for partial name matching
INSERT INTO clients (client_name, client_type, date_intake, date_of_birth, address, phone, email, contact_1, relationship_1, contact_2, relationship_2, notes, county, arrested, charges, court_date, quoted, initial_payment, due_date_balance)
SELECT 'Todd Jones', 'criminal', '2025-09-20', '1982-03-15', '123 Oak Street, Springfield, IL 62701', '2175550123', 'todd.jones@email.com', 'Mary Jones', 'Wife', 'John Jones', 'Brother', 'Test client for partial name search functionality', 'Sangamon County', true, 'Theft, Burglary', '2025-11-05', '3500.00', '700.00', '2025-10-25'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE client_name = 'Todd Jones');
-- Verification query - you can run this separately to check if Todd Jones exists
-- SELECT client_name FROM clients WHERE client_name ILIKE '%Todd%';
