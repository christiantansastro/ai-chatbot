-- Create a read-only view for client profile data
DROP VIEW IF EXISTS client_profiles;

CREATE VIEW client_profiles AS
SELECT
  id,
  client_name,
  client_type,
  email,
  phone,
  address,
  notes,
  contact_1,
  relationship_1,
  contact_1_phone,
  contact_2,
  relationship_2,
  contact_2_phone,
  county,
  court_date,
  quoted,
  initial_payment,
  due_date_balance,
  arrested,
  arrested_county,
  currently_incarcerated,
  incarceration_location,
  incarceration_reason,
  last_bond_hearing_date,
  last_bond_hearing_location,
  on_probation,
  probation_county,
  probation_officer,
  on_parole,
  parole_officer,
  case_type,
  children_involved,
  children_details,
  created_at,
  updated_at
FROM clients;

-- Communications view for read-only access
DROP VIEW IF EXISTS client_communications;

CREATE VIEW client_communications AS
SELECT
  comm.id,
  comm.client_id,
  cl.client_name,
  comm.communication_date,
  comm.communication_type::text AS communication_type,
  comm.subject,
  comm.notes,
  comm.created_at,
  comm.updated_at
FROM communications comm
LEFT JOIN clients cl ON cl.id = comm.client_id;

-- Files view for read-only access
DROP VIEW IF EXISTS client_files;

CREATE VIEW client_files AS
SELECT
  id,
  client_name,
  file_name,
  file_type,
  file_size,
  file_url,
  upload_timestamp,
  temp_queue_id,
  status,
  created_at,
  updated_at
FROM files;
