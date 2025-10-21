-- Migration: Add files table for file storage functionality
-- Created: 2025-10-21
-- Description: Creates the files table to store file metadata and associations

-- Create the files table
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    client_name VARCHAR(255) NOT NULL, -- Store client name for reference (always required)
    file_name TEXT NOT NULL,
    file_type VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    file_url TEXT NOT NULL,
    upload_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    uploader_user_id UUID NOT NULL REFERENCES users(id),
    temp_queue_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'temp_queue', 'error')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_files_client_id ON files(client_id);
CREATE INDEX IF NOT EXISTS idx_files_uploader_user_id ON files(uploader_user_id);
CREATE INDEX IF NOT EXISTS idx_files_temp_queue_id ON files(temp_queue_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies for files table
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access files they uploaded
CREATE POLICY "Users can access own files" ON files
    FOR ALL USING (uploader_user_id = auth.uid());

-- Policy: Allow service role to access all files (for file storage tool)
CREATE POLICY "Service role can access all files" ON files
    FOR ALL USING (current_setting('role') = 'service_role');