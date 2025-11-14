-- Create or replace a view that summarizes financial balances per client
DROP VIEW IF EXISTS client_balances;

CREATE VIEW client_balances AS
SELECT
  client_name,
  COALESCE(SUM(CASE WHEN transaction_type = 'quote' THEN amount ELSE 0 END), 0) AS total_quoted,
  COALESCE(SUM(CASE WHEN transaction_type IN ('payment', 'adjustment') THEN amount ELSE 0 END), 0) AS total_paid,
  COALESCE(SUM(CASE WHEN transaction_type = 'quote' THEN amount ELSE -amount END), 0) AS outstanding_balance,
  COUNT(*)::bigint AS transaction_count,
  MAX(transaction_date) AS latest_transaction_date
FROM financials
GROUP BY client_name;

-- Read-only SQL runner for AI tooling
DROP FUNCTION IF EXISTS run_sql_readonly(text);
CREATE OR REPLACE FUNCTION run_sql_readonly(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text;
  dataset jsonb;
BEGIN
  IF query IS NULL OR length(trim(query)) = 0 THEN
    RAISE EXCEPTION 'Query cannot be empty';
  END IF;

  IF position(';' IN query) > 0 THEN
    RAISE EXCEPTION 'Multiple SQL statements are not allowed';
  END IF;

  normalized := lower(ltrim(query));

  IF left(normalized, 6) <> 'select' THEN
    RAISE EXCEPTION 'Only SELECT statements are allowed';
  END IF;

  EXECUTE format('SELECT jsonb_agg(row) FROM (%s) AS row', query)
    INTO dataset;

  RETURN COALESCE(dataset, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION run_sql_readonly(text) TO anon, authenticated, service_role;
