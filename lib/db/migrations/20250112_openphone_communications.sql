-- Add OpenPhone linkage column to clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS openphone_contact_id text;

-- Track communication provenance & OpenPhone IDs
ALTER TABLE communications
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'chatbot',
  ADD COLUMN IF NOT EXISTS openphone_call_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS openphone_conversation_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS openphone_event_timestamp timestamptz;

CREATE INDEX IF NOT EXISTS idx_communications_openphone_call_id ON communications(openphone_call_id);
CREATE INDEX IF NOT EXISTS idx_communications_openphone_conversation_id ON communications(openphone_conversation_id);
