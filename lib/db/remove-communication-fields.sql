-- SQL Script to Remove Specified Fields from Communications Table
-- Generated: 2025-09-30
-- WARNING: Backup your data before running this script!

-- Step 1: Drop indexes that reference the columns being removed
DROP INDEX IF EXISTS idx_communications_direction;
DROP INDEX IF EXISTS idx_communications_priority;
DROP INDEX IF EXISTS idx_communications_follow_up;

-- Step 2: Drop the columns from the communications table
ALTER TABLE communications DROP COLUMN IF EXISTS direction;
ALTER TABLE communications DROP COLUMN IF EXISTS priority;
ALTER TABLE communications DROP COLUMN IF EXISTS follow_up_required;
ALTER TABLE communications DROP COLUMN IF EXISTS follow_up_date;
ALTER TABLE communications DROP COLUMN IF EXISTS follow_up_notes;
ALTER TABLE communications DROP COLUMN IF EXISTS duration_minutes;
ALTER TABLE communications DROP COLUMN IF EXISTS outcome;
ALTER TABLE communications DROP COLUMN IF EXISTS next_action;

-- Step 3: Update functions to remove references to dropped columns

-- Drop existing functions first (required before recreating with different signatures)
DROP FUNCTION IF EXISTS get_client_recent_communications(UUID, INTEGER);
DROP FUNCTION IF EXISTS search_communications_by_client(TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_communications_by_date_range(DATE, DATE, communication_type_enum);

-- Update get_client_recent_communications function
CREATE OR REPLACE FUNCTION get_client_recent_communications(
  client_uuid UUID,
  limit_count INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  communication_date DATE,
  communication_type VARCHAR(20),
  subject TEXT,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.communication_date,
    c.communication_type::VARCHAR(20),
    c.subject,
    c.notes
  FROM communications c
  WHERE c.client_id = client_uuid
  ORDER BY c.communication_date DESC, c.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Update search_communications_by_client function
CREATE OR REPLACE FUNCTION search_communications_by_client(
  search_query TEXT,
  max_results INTEGER DEFAULT 50
)
RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  communication_count BIGINT,
  latest_communication_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as client_id,
    c.client_name,
    COUNT(comm.*) as communication_count,
    MAX(comm.communication_date) as latest_communication_date
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

-- Note: get_pending_follow_ups function removed because it depends on follow_up_date column that was removed
-- If you need similar functionality, consider creating a new function that works with the remaining columns

-- Update get_communications_by_date_range function
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
  subject TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.client_id,
    cl.client_name,
    c.communication_date,
    c.communication_type::VARCHAR(20),
    c.subject
  FROM communications c
  JOIN clients cl ON c.client_id = cl.id
  WHERE c.communication_date >= start_date
    AND c.communication_date <= end_date
    AND (comm_type IS NULL OR c.communication_type = comm_type)
  ORDER BY c.communication_date DESC, c.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Drop unused enum types
DROP TYPE IF EXISTS communication_direction_enum;
DROP TYPE IF EXISTS priority_enum;

-- Grant necessary permissions (updated for modified functions)
GRANT ALL ON communications TO authenticated;
GRANT ALL ON communications TO service_role;
GRANT EXECUTE ON FUNCTION get_client_recent_communications(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION search_communications_by_client(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_communications_by_date_range(DATE, DATE, communication_type_enum) TO authenticated;

-- Verification query (optional - run this to confirm the changes)
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'communications' ORDER BY ordinal_position;