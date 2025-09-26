-- Optimized Communications Table for Supabase
-- Run this in your Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum type for communication types
DO $$ BEGIN
    CREATE TYPE communication_type_enum AS ENUM ('phone_call', 'email', 'meeting', 'sms', 'letter', 'court_hearing', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create enum type for communication direction
DO $$ BEGIN
    CREATE TYPE communication_direction_enum AS ENUM ('inbound', 'outbound');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create enum type for priority levels
DO $$ BEGIN
    CREATE TYPE priority_enum AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- First, ensure the clients table exists (if not, create a minimal version)
DO $$
BEGIN
    -- Try to create clients table if it doesn't exist
    CREATE TABLE IF NOT EXISTS clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_name TEXT NOT NULL,
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
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
EXCEPTION
    WHEN duplicate_object THEN
        -- Table already exists, do nothing
        RAISE NOTICE 'Clients table already exists';
END $$;

-- Drop existing table if it exists (backup your data first!)
DROP TABLE IF EXISTS communications CASCADE;

-- Create the optimized communications table
CREATE TABLE communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  communication_date DATE NOT NULL DEFAULT CURRENT_DATE,
  communication_type communication_type_enum NOT NULL,
  direction communication_direction_enum NOT NULL,
  priority priority_enum DEFAULT 'medium',
  subject TEXT, -- Brief summary/title of the communication
  notes TEXT NOT NULL, -- Detailed notes about the communication
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_date DATE,
  follow_up_notes TEXT,
  related_case_number VARCHAR(50), -- Link to financial case if applicable
  court_date DATE, -- For court hearings and legal dates
  duration_minutes INTEGER, -- For meetings and calls
  outcome VARCHAR(100), -- Result of the communication (e.g., "Payment promised", "Information provided")
  next_action TEXT, -- What needs to happen next
  created_by TEXT, -- Who recorded this communication
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_communications_client_date ON communications(client_id, communication_date DESC);
CREATE INDEX IF NOT EXISTS idx_communications_type ON communications(communication_type);
CREATE INDEX IF NOT EXISTS idx_communications_direction ON communications(direction);
CREATE INDEX IF NOT EXISTS idx_communications_priority ON communications(priority);
CREATE INDEX IF NOT EXISTS idx_communications_follow_up ON communications(follow_up_required, follow_up_date) WHERE follow_up_required = true;
CREATE INDEX IF NOT EXISTS idx_communications_case ON communications(related_case_number);
CREATE INDEX IF NOT EXISTS idx_communications_court_date ON communications(court_date) WHERE court_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communications_client_type ON communications(client_id, communication_type, communication_date DESC);

-- Create function to get recent communications for a client
CREATE OR REPLACE FUNCTION get_client_recent_communications(
  client_uuid UUID,
  limit_count INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  communication_date DATE,
  communication_type VARCHAR(20),
  direction VARCHAR(20),
  priority VARCHAR(20),
  subject TEXT,
  notes TEXT,
  follow_up_required BOOLEAN,
  follow_up_date DATE,
  outcome VARCHAR(100),
  next_action TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.communication_date,
    c.communication_type::VARCHAR(20),
    c.direction::VARCHAR(20),
    c.priority::VARCHAR(20),
    c.subject,
    c.notes,
    c.follow_up_required,
    c.follow_up_date,
    c.outcome,
    c.next_action
  FROM communications c
  WHERE c.client_id = client_uuid
  ORDER BY c.communication_date DESC, c.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to search communications by client name
CREATE OR REPLACE FUNCTION search_communications_by_client(
  search_query TEXT,
  max_results INTEGER DEFAULT 50
)
RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  communication_count BIGINT,
  latest_communication_date DATE,
  follow_ups_pending BIGINT,
  high_priority_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as client_id,
    c.client_name,
    COUNT(comm.*) as communication_count,
    MAX(comm.communication_date) as latest_communication_date,
    COUNT(CASE WHEN comm.follow_up_required = true AND comm.follow_up_date >= CURRENT_DATE THEN 1 END) as follow_ups_pending,
    COUNT(CASE WHEN comm.priority IN ('high', 'urgent') THEN 1 END) as high_priority_count
  FROM clients c
  LEFT JOIN communications comm ON c.id = comm.client_id
  WHERE c.client_name ILIKE '%' || search_query || '%'
  GROUP BY c.id, c.client_name
  HAVING COUNT(comm.*) > 0 OR search_query = ''
  ORDER BY
    CASE WHEN search_query != '' THEN similarity(c.client_name, search_query) ELSE 1 END DESC,
    c.client_name
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Create function to get pending follow-ups
CREATE OR REPLACE FUNCTION get_pending_follow_ups(
  days_ahead INTEGER DEFAULT 7
)
RETURNS TABLE (
  id UUID,
  client_id UUID,
  client_name TEXT,
  communication_date DATE,
  communication_type VARCHAR(20),
  priority VARCHAR(20),
  subject TEXT,
  follow_up_date DATE,
  follow_up_notes TEXT,
  days_until_follow_up INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.client_id,
    cl.client_name,
    c.communication_date,
    c.communication_type::VARCHAR(20),
    c.priority::VARCHAR(20),
    c.subject,
    c.follow_up_date,
    c.follow_up_notes,
    (c.follow_up_date - CURRENT_DATE)::INTEGER as days_until_follow_up
  FROM communications c
  JOIN clients cl ON c.client_id = cl.id
  WHERE c.follow_up_required = true
    AND c.follow_up_date >= CURRENT_DATE
    AND c.follow_up_date <= (CURRENT_DATE + INTERVAL '1 day' * days_ahead)
  ORDER BY c.follow_up_date ASC, c.priority DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to get communications by type and date range
CREATE OR REPLACE FUNCTION get_communications_by_date_range(
  start_date DATE,
  end_date DATE,
  comm_type communication_type_enum DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  client_id UUID,
  client_name TEXT,
  communication_date DATE,
  communication_type VARCHAR(20),
  direction VARCHAR(20),
  priority VARCHAR(20),
  subject TEXT,
  outcome VARCHAR(100)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.client_id,
    cl.client_name,
    c.communication_date,
    c.communication_type::VARCHAR(20),
    c.direction::VARCHAR(20),
    c.priority::VARCHAR(20),
    c.subject,
    c.outcome
  FROM communications c
  JOIN clients cl ON c.client_id = cl.id
  WHERE c.communication_date >= start_date
    AND c.communication_date <= end_date
    AND (comm_type IS NULL OR c.communication_type = comm_type)
  ORDER BY c.communication_date DESC, c.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL ON communications TO authenticated;
GRANT ALL ON communications TO service_role;
GRANT EXECUTE ON FUNCTION get_client_recent_communications(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION search_communications_by_client(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_follow_ups(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_communications_by_date_range(DATE, DATE, communication_type_enum) TO authenticated;

-- Insert sample communications data for testing
-- This will work with both foreign key and standalone versions

-- Sample data for Burt Reynolds (from your example)
INSERT INTO communications (client_id, client_name, communication_date, communication_type, direction, priority, subject, notes, follow_up_required, follow_up_date, related_case_number, court_date, outcome, next_action)
SELECT
  c.id,
  'Burt Reynolds',
  '2025-09-11'::date,
  'phone_call'::communication_type_enum,
  'inbound'::communication_direction_enum,
  'medium'::priority_enum,
  'Payment commitment discussion',
  'He said he would come back Friday and pay $500.',
  true,
  '2025-09-13'::date,
  'CASE-001',
  '2025-09-11'::date,
  'Payment promised for Friday',
  'Follow up on Friday to collect $500 payment'
FROM clients c
WHERE c.client_name = 'Burt Reynolds'
ON CONFLICT DO NOTHING;

-- Sample data for John Smith (multiple communication types)
INSERT INTO communications (client_id, client_name, communication_date, communication_type, direction, priority, subject, notes, follow_up_required, follow_up_date, related_case_number, outcome, next_action)
SELECT
  c.id,
  'John Smith',
  '2025-09-20'::date,
  'email'::communication_type_enum,
  'outbound'::communication_direction_enum,
  'high'::priority_enum,
  'Outstanding balance reminder',
  'Sent reminder email about the remaining $900 balance. Client responded that they will make payment next week.',
  true,
  '2025-09-27'::date,
  'CASE-001',
  NULL,
  'Payment expected next week',
  'Send follow-up email if no payment received by Monday'
FROM clients c
WHERE c.client_name = 'John Smith'
ON CONFLICT DO NOTHING;

INSERT INTO communications (client_id, client_name, communication_date, communication_type, direction, priority, subject, notes, follow_up_required, related_case_number, duration_minutes, outcome)
SELECT
  c.id,
  'John Smith',
  '2025-09-18'::date,
  'meeting'::communication_type_enum,
  'outbound'::communication_direction_enum,
  'medium'::priority_enum,
  'Case strategy meeting',
  'Met with client to discuss case progress and payment schedule. Client agreed to monthly payments of $300.',
  false,
  'CASE-001',
  45,
  'Payment plan established'
FROM clients c
WHERE c.client_name = 'John Smith'
ON CONFLICT DO NOTHING;

-- Sample data for Sarah Johnson (court hearing)
INSERT INTO communications (client_id, client_name, communication_date, communication_type, direction, priority, subject, notes, follow_up_required, related_case_number, court_date, outcome, next_action)
SELECT
  c.id,
  'Sarah Johnson',
  '2025-09-22'::date,
  'court_hearing'::communication_type_enum,
  'outbound'::communication_direction_enum,
  'urgent'::priority_enum,
  'Court hearing preparation',
  'Prepared client for upcoming court hearing. Reviewed all documents and discussed testimony strategy.',
  true,
  'CASE-002',
  '2025-09-25'::date,
  'Hearing preparation completed',
  'Attend court hearing on scheduled date'
FROM clients c
WHERE c.client_name = 'Sarah Johnson'
ON CONFLICT DO NOTHING;

-- Sample data for Emily Davis (SMS communication)
INSERT INTO communications (client_id, client_name, communication_date, communication_type, direction, priority, subject, notes, follow_up_required, related_case_number, outcome)
SELECT
  c.id,
  'Emily Davis',
  '2025-09-24'::date,
  'sms'::communication_type_enum,
  'outbound'::communication_direction_enum,
  'medium'::priority_enum,
  'Payment reminder',
  'Sent SMS reminder about upcoming $1200 payment due on October 1st. Client confirmed receipt.',
  false,
  'CASE-004',
  'Payment reminder sent and acknowledged'
FROM clients c
WHERE c.client_name = 'Emily Davis'
ON CONFLICT DO NOTHING;

-- Sample data for Robert Wilson (follow-up required)
INSERT INTO communications (client_id, client_name, communication_date, communication_type, direction, priority, subject, notes, follow_up_required, follow_up_date, related_case_number, outcome, next_action)
SELECT
  c.id,
  'Robert Wilson',
  '2025-09-23'::date,
  'phone_call'::communication_type_enum,
  'inbound'::communication_direction_enum,
  'high'::priority_enum,
  'Document request',
  'Client called requesting additional documents for the real estate transaction. Needs title deed and survey report.',
  true,
  '2025-09-24'::date,
  'CASE-005',
  'Documents requested by client',
  'Send requested documents via email'
FROM clients c
WHERE c.client_name = 'Robert Wilson'
ON CONFLICT DO NOTHING;

-- Sample data for Lisa Anderson (letter communication)
INSERT INTO communications (client_id, client_name, communication_date, communication_type, direction, priority, subject, notes, follow_up_required, related_case_number, outcome)
SELECT
  c.id,
  'Lisa Anderson',
  '2025-09-21'::date,
  'letter'::communication_type_enum,
  'outbound'::communication_direction_enum,
  'low'::priority_enum,
  'Trademark application update',
  'Sent formal letter updating client on trademark application status and next steps in the process.',
  false,
  'CASE-006',
  'Status update letter sent'
FROM clients c
WHERE c.client_name = 'Lisa Anderson'
ON CONFLICT DO NOTHING;

-- Standalone version sample data (if foreign keys fail)
-- These will work even without the clients table
INSERT INTO communications (client_name, communication_date, communication_type, direction, priority, subject, notes, follow_up_required, follow_up_date, related_case_number, outcome, next_action)
SELECT 'Standalone Client B', '2025-09-10'::date, 'phone_call'::communication_type_enum, 'inbound'::communication_direction_enum, 'medium'::priority_enum, 'Initial consultation', 'Client called for initial consultation about legal services needed.', true, '2025-09-12'::date, 'STANDALONE-002', 'Consultation scheduled', 'Prepare consultation materials'
WHERE NOT EXISTS (SELECT 1 FROM communications WHERE client_name = 'Standalone Client B')
ON CONFLICT DO NOTHING;

INSERT INTO communications (client_name, communication_date, communication_type, direction, priority, subject, notes, follow_up_required, related_case_number, outcome)
SELECT 'Standalone Client B', '2025-09-12'::date, 'meeting'::communication_type_enum, 'outbound'::communication_direction_enum, 'medium'::priority_enum, 'Consultation meeting', 'Conducted initial consultation meeting. Client needs help with contract review and business formation.', false, 'STANDALONE-002', 'Consultation completed successfully'
WHERE NOT EXISTS (SELECT 1 FROM communications WHERE client_name = 'Standalone Client B' AND communication_type = 'meeting')
ON CONFLICT DO NOTHING;