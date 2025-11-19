-- Consolidated client data view for complex read-only analytics queries
DROP VIEW IF EXISTS client_data_overview;

CREATE VIEW client_data_overview AS
WITH financial_by_id AS (
  SELECT
    client_id,
    COALESCE(SUM(CASE WHEN transaction_type = 'quote' THEN amount ELSE 0 END), 0) AS total_quoted,
    COALESCE(SUM(CASE WHEN transaction_type IN ('payment', 'adjustment') THEN amount ELSE 0 END), 0) AS total_paid,
    COALESCE(SUM(CASE WHEN transaction_type = 'quote' THEN amount ELSE -amount END), 0) AS outstanding_balance,
    COUNT(*)::bigint AS transaction_count,
    MAX(transaction_date) AS latest_transaction_date
  FROM financials
  WHERE client_id IS NOT NULL
  GROUP BY client_id
),
financial_by_name AS (
  SELECT
    client_name,
    COALESCE(SUM(CASE WHEN transaction_type = 'quote' THEN amount ELSE 0 END), 0) AS total_quoted,
    COALESCE(SUM(CASE WHEN transaction_type IN ('payment', 'adjustment') THEN amount ELSE 0 END), 0) AS total_paid,
    COALESCE(SUM(CASE WHEN transaction_type = 'quote' THEN amount ELSE -amount END), 0) AS outstanding_balance,
    COUNT(*)::bigint AS transaction_count,
    MAX(transaction_date) AS latest_transaction_date
  FROM financials
  WHERE client_name IS NOT NULL
  GROUP BY client_name
),
communication_summary AS (
  SELECT
    client_id,
    COUNT(*)::bigint AS total_communications,
    COUNT(*) FILTER (
      WHERE communication_date >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 days'
    )::bigint AS communications_last_30_days,
    MAX(communication_date) AS last_communication_date,
    MAX(created_at) AS last_communication_created_at
  FROM communications
  GROUP BY client_id
),
file_summary AS (
  SELECT
    client_name,
    COUNT(*)::bigint AS total_files,
    MAX(upload_timestamp) AS last_file_uploaded_at
  FROM files
  GROUP BY client_name
)
SELECT
  c.id AS client_id,
  c.client_name,
  c.client_type,
  c.email,
  c.phone,
  c.address,
  c.county,
  c.case_type,
  c.court_date,
  c.quoted,
  c.initial_payment,
  c.due_date_balance,
  c.arrested,
  c.currently_incarcerated,
  c.on_probation,
  c.on_parole,
  c.created_at,
  c.updated_at,
  COALESCE(fid.total_quoted, fin.total_quoted, 0) AS total_quoted,
  COALESCE(fid.total_paid, fin.total_paid, 0) AS total_paid,
  COALESCE(fid.outstanding_balance, fin.outstanding_balance, 0) AS outstanding_balance,
  COALESCE(fid.transaction_count, fin.transaction_count, 0) AS transaction_count,
  COALESCE(fid.latest_transaction_date, fin.latest_transaction_date) AS latest_transaction_date,
  comm.total_communications,
  comm.communications_last_30_days,
  comm.last_communication_date,
  comm.last_communication_created_at,
  files.total_files,
  files.last_file_uploaded_at
FROM clients c
LEFT JOIN financial_by_id fid ON fid.client_id = c.id
LEFT JOIN financial_by_name fin ON fin.client_name = c.client_name
LEFT JOIN communication_summary comm ON comm.client_id = c.id
LEFT JOIN file_summary files ON files.client_name = c.client_name;

GRANT SELECT ON client_data_overview TO anon, authenticated, service_role;
