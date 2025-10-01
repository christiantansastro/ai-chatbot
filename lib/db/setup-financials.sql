-- Financial Records Table for Supabase
-- Run this in your Supabase SQL Editor to add financial statement support

-- Create enum type for transaction types
DO $$ BEGIN
    CREATE TYPE transaction_type_enum AS ENUM ('quote', 'payment', 'adjustment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create the financials table
CREATE TABLE IF NOT EXISTS financials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT, -- For standalone usage
  case_number VARCHAR(50),
  transaction_type transaction_type_enum NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(50), -- Cash, Credit Card, Bank Transfer, etc.
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  service_description TEXT, -- What service was provided
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_financials_client_date ON financials(client_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_financials_type ON financials(transaction_type);
CREATE INDEX IF NOT EXISTS idx_financials_case ON financials(case_number);
CREATE INDEX IF NOT EXISTS idx_financials_client_balance ON financials(client_id)
WHERE transaction_type IN ('quote', 'payment', 'adjustment');

-- Create function to get client balance (supports both client_id and client_name)
CREATE OR REPLACE FUNCTION get_client_balance(client_uuid UUID DEFAULT NULL, client_name_param TEXT DEFAULT NULL)
RETURNS TABLE (
  total_quoted DECIMAL(12,2),
  total_paid DECIMAL(12,2),
  balance DECIMAL(12,2),
  transaction_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN f.transaction_type = 'quote' THEN f.amount ELSE 0 END), 0) as total_quoted,
    COALESCE(SUM(CASE WHEN f.transaction_type IN ('payment', 'adjustment') THEN f.amount ELSE 0 END), 0) as total_paid,
    COALESCE(SUM(CASE WHEN f.transaction_type = 'quote' THEN f.amount ELSE -f.amount END), 0) as balance,
    COUNT(*) as transaction_count
  FROM financials f
  WHERE (client_uuid IS NOT NULL AND f.client_id = client_uuid)
     OR (client_name_param IS NOT NULL AND f.client_name = client_name_param);
END;
$$ LANGUAGE plpgsql;

-- Create function to get recent transactions (supports both client_id and client_name)
CREATE OR REPLACE FUNCTION get_client_recent_transactions(
  client_uuid UUID DEFAULT NULL,
  client_name_param TEXT DEFAULT NULL,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  transaction_type VARCHAR(20),
  amount DECIMAL(12,2),
  transaction_date DATE,
  payment_method VARCHAR(50),
  service_description TEXT,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.transaction_type::VARCHAR(20),
    f.amount,
    f.transaction_date,
    f.payment_method,
    f.service_description,
    f.notes
  FROM financials f
  WHERE (client_uuid IS NOT NULL AND f.client_id = client_uuid)
     OR (client_name_param IS NOT NULL AND f.client_name = client_name_param)
  ORDER BY f.transaction_date DESC, f.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to search financial records by client name
CREATE OR REPLACE FUNCTION search_financials_by_client(
  search_query TEXT,
  max_results INTEGER DEFAULT 50
)
RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  total_quoted DECIMAL(12,2),
  total_paid DECIMAL(12,2),
  balance DECIMAL(12,2),
  transaction_count BIGINT,
  latest_transaction_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as client_id,
    c.client_name,
    COALESCE(SUM(CASE WHEN f.transaction_type = 'quote' THEN f.amount ELSE 0 END), 0) as total_quoted,
    COALESCE(SUM(CASE WHEN f.transaction_type IN ('payment', 'adjustment') THEN f.amount ELSE 0 END), 0) as total_paid,
    COALESCE(SUM(CASE WHEN f.transaction_type = 'quote' THEN f.amount ELSE -f.amount END), 0) as balance,
    COUNT(f.*) as transaction_count,
    MAX(f.transaction_date) as latest_transaction_date
  FROM clients c
  LEFT JOIN financials f ON c.id = f.client_id
  WHERE c.client_name ILIKE '%' || search_query || '%'
  GROUP BY c.id, c.client_name
  HAVING COUNT(f.*) > 0 OR search_query = ''
  ORDER BY
    CASE WHEN search_query != '' THEN similarity(c.client_name, search_query) ELSE 1 END DESC,
    c.client_name
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Insert sample financial data for testing
-- This will work with both foreign key and standalone versions

-- Sample data for John Smith (outstanding balance)
INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-001',
  'quote'::transaction_type_enum,
  1500.00,
  NULL,
  '2025-09-01'::date,
  'Legal consultation and case preparation',
  'Initial consultation fee for contract review'
FROM clients c
WHERE c.client_name = 'John Smith'
ON CONFLICT DO NOTHING;

INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-001',
  'payment'::transaction_type_enum,
  600.00,
  'Credit Card',
  '2025-09-15'::date,
  'Partial payment for legal services',
  'First installment payment'
FROM clients c
WHERE c.client_name = 'John Smith'
ON CONFLICT DO NOTHING;

-- Sample data for Sarah Johnson (fully paid)
INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-002',
  'quote'::transaction_type_enum,
  2500.00,
  NULL,
  '2025-08-01'::date,
  'Business incorporation and setup',
  'Complete business formation package'
FROM clients c
WHERE c.client_name = 'Sarah Johnson'
ON CONFLICT DO NOTHING;

INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-002',
  'payment'::transaction_type_enum,
  2500.00,
  'Bank Transfer',
  '2025-08-15'::date,
  'Full payment for incorporation services',
  'Payment received in full'
FROM clients c
WHERE c.client_name = 'Sarah Johnson'
ON CONFLICT DO NOTHING;

-- Sample data for Michael Brown (overpaid - credit balance)
INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-003',
  'quote'::transaction_type_enum,
  800.00,
  NULL,
  '2025-09-05'::date,
  'Contract review and legal advice',
  'Standard contract review package'
FROM clients c
WHERE c.client_name = 'Michael Brown'
ON CONFLICT DO NOTHING;

INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-003',
  'payment'::transaction_type_enum,
  1000.00,
  'Cash',
  '2025-09-10'::date,
  'Overpayment for legal services',
  'Client overpaid, credit balance created'
FROM clients c
WHERE c.client_name = 'Michael Brown'
ON CONFLICT DO NOTHING;

-- Sample data for Emily Davis (multiple payments)
INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-004',
  'quote'::transaction_type_enum,
  3200.00,
  NULL,
  '2025-07-01'::date,
  'Complex litigation case',
  'Multi-stage litigation with court appearances'
FROM clients c
WHERE c.client_name = 'Emily Davis'
ON CONFLICT DO NOTHING;

INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-004',
  'payment'::transaction_type_enum,
  1200.00,
  'Check',
  '2025-07-15'::date,
  'First installment payment',
  'Initial retainer payment'
FROM clients c
WHERE c.client_name = 'Emily Davis'
ON CONFLICT DO NOTHING;

INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-004',
  'payment'::transaction_type_enum,
  1200.00,
  'Bank Transfer',
  '2025-08-01'::date,
  'Second installment payment',
  'Second payment installment'
FROM clients c
WHERE c.client_name = 'Emily Davis'
ON CONFLICT DO NOTHING;

-- Sample data for Robert Wilson (with adjustments)
INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-005',
  'quote'::transaction_type_enum,
  950.00,
  NULL,
  '2025-09-10'::date,
  'Real estate transaction support',
  'Property purchase legal support'
FROM clients c
WHERE c.client_name = 'Robert Wilson'
ON CONFLICT DO NOTHING;

INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-005',
  'adjustment'::transaction_type_enum,
  50.00,
  NULL,
  '2025-09-12'::date,
  'Additional filing fees',
  'Additional court filing fees not included in original quote'
FROM clients c
WHERE c.client_name = 'Robert Wilson'
ON CONFLICT DO NOTHING;

INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-005',
  'payment'::transaction_type_enum,
  500.00,
  'Credit Card',
  '2025-09-20'::date,
  'Partial payment with adjustment',
  'Payment including additional fees'
FROM clients c
WHERE c.client_name = 'Robert Wilson'
ON CONFLICT DO NOTHING;

-- Sample data for Lisa Anderson (recent activity)
INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-006',
  'quote'::transaction_type_enum,
  1800.00,
  NULL,
  '2025-09-20'::date,
  'Brand design and trademark registration',
  'Logo design, branding package, and trademark filing'
FROM clients c
WHERE c.client_name = 'Lisa Anderson'
ON CONFLICT DO NOTHING;

INSERT INTO financials (client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
SELECT
  c.id,
  c.client_name,
  'CASE-006',
  'payment'::transaction_type_enum,
  900.00,
  'PayPal',
  '2025-09-25'::date,
  'Design phase payment',
  'Payment for initial design concepts'
FROM clients c
WHERE c.client_name = 'Lisa Anderson'
ON CONFLICT DO NOTHING;

-- Standalone version sample data (for when clients table doesn't exist)
-- INSERT INTO financials (client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
-- SELECT 'Standalone Client A', 'STANDALONE-001', 'quote'::transaction_type_enum, 750.00, NULL, '2025-09-01'::date, 'Sample service', 'Standalone test record'
-- WHERE NOT EXISTS (SELECT 1 FROM financials WHERE client_name = 'Standalone Client A')
-- ON CONFLICT DO NOTHING;

-- INSERT INTO financials (client_name, case_number, transaction_type, amount, payment_method, transaction_date, service_description, notes)
-- SELECT 'Standalone Client A', 'STANDALONE-001', 'payment'::transaction_type_enum, 375.00, 'Cash', '2025-09-15'::date, 'Partial payment', 'Standalone test payment'
-- WHERE NOT EXISTS (SELECT 1 FROM financials WHERE client_name = 'Standalone Client A' AND transaction_type = 'payment')
-- ON CONFLICT DO NOTHING;

-- Grant necessary permissions
GRANT ALL ON financials TO authenticated;
GRANT ALL ON financials TO service_role;
GRANT EXECUTE ON FUNCTION get_client_balance(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_client_recent_transactions(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION search_financials_by_client(TEXT, INTEGER) TO authenticated;

-- Update documents table to allow financial-statement kind (for existing databases)
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_kind_check;
ALTER TABLE documents ADD CONSTRAINT documents_kind_check
    CHECK (kind IN ('text', 'code', 'image', 'sheet', 'financial-statement'));

-- Alternative simplified version (if the above fails, try this instead):
/*
-- If you get foreign key errors, you can create a standalone version:
CREATE TABLE financials_standalone (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL, -- Store client name directly instead of foreign key
  case_number VARCHAR(50),
  transaction_type transaction_type_enum NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(50),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  service_description TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Copy this if you need to use the standalone version
-- DROP TABLE financials;
-- ALTER TABLE financials_standalone RENAME TO financials;
*/