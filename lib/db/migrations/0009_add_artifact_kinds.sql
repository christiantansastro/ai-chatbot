-- Add financial-statement and client-report to the allowed document kinds
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_kind_check";
ALTER TABLE "documents" ADD CONSTRAINT "documents_kind_check" CHECK ("kind" IN ('text', 'code', 'image', 'sheet', 'financial-statement', 'client-report'));