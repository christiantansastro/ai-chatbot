-- Financial Data Migration SQL
-- Insert financial records for the 7 clients based on their quotes and initial payments

-- First, ensure the financials table exists (run setup-financials.sql if needed)

-- 1. Mason E. Smith - Quote: $250.00 (no initial payment)
INSERT INTO "public"."financials" ("id", "client_id", "client_name", "case_number", "transaction_type", "amount", "transaction_date", "service_description", "notes", "created_at", "updated_at")
VALUES (
    gen_random_uuid(),
    '0a1f87f0-1b95-47dc-93cf-8aadbfe53a7f',
    'Mason E. Smith',
    'CASE-202510-MAS',
    'quote',
    250.00,
    '2025-10-13',
    'Legal services for criminal case - Move prisons',
    'Migrated from clients table',
    NOW(),
    NOW()
);

-- 2. Jeremy Nunez - Quote: $4500.00, Initial Payment: $2000.00
INSERT INTO "public"."financials" ("id", "client_id", "client_name", "case_number", "transaction_type", "amount", "payment_method", "transaction_date", "service_description", "notes", "created_at", "updated_at")
VALUES
(
    gen_random_uuid(),
    '15297776-d94f-49ea-b12e-9429f4a30830',
    'Jeremy Nunez',
    'CASE-202510-JER',
    'quote',
    4500.00,
    NULL,
    '2025-10-07',
    'Legal services for criminal case - Poss of vapes, gun, objects, etc.',
    'Migrated from clients table',
    NOW(),
    NOW()
),
(
    gen_random_uuid(),
    '15297776-d94f-49ea-b12e-9429f4a30830',
    'Jeremy Nunez',
    'CASE-202510-JER',
    'payment',
    2000.00,
    'Initial Payment',
    '2025-10-07',
    'Initial payment for legal services',
    'Migrated from clients table',
    NOW(),
    NOW()
);

-- 3. Irma Nunez - Quote: $2000.00, Initial Payment: $1000.00
INSERT INTO "public"."financials" ("id", "client_id", "client_name", "case_number", "transaction_type", "amount", "payment_method", "transaction_date", "service_description", "notes", "created_at", "updated_at")
VALUES
(
    gen_random_uuid(),
    '1d8880ff-5ee8-4fc8-84ee-57073903dd34',
    'Irma Nunez',
    'CASE-202510-IRM',
    'quote',
    2000.00,
    NULL,
    '2025-10-07',
    'Legal services for criminal case - Poss of schedule 1 (2 counts)',
    'Migrated from clients table',
    NOW(),
    NOW()
),
(
    gen_random_uuid(),
    '1d8880ff-5ee8-4fc8-84ee-57073903dd34',
    'Irma Nunez',
    'CASE-202510-IRM',
    'payment',
    1000.00,
    'Initial Payment',
    '2025-10-07',
    'Initial payment for legal services',
    'Migrated from clients table',
    NOW(),
    NOW()
);

-- 4. Jordan Pickard - Quote: $3000.00, Initial Payment: $1000.00
INSERT INTO "public"."financials" ("id", "client_id", "client_name", "case_number", "transaction_type", "amount", "payment_method", "transaction_date", "payment_due_date", "service_description", "notes", "created_at", "updated_at")
VALUES
(
    gen_random_uuid(),
    '2ee3281a-7b37-4535-aa73-9a64060afff4',
    'Jordan Pickard',
    'CASE-202510-JOR',
    'quote',
    3000.00,
    NULL,
    '2025-10-08',
    '2025-11-18',
    'Legal services for criminal case - Probation Violation',
    'Migrated from clients table',
    NOW(),
    NOW()
),
(
    gen_random_uuid(),
    '2ee3281a-7b37-4535-aa73-9a64060afff4',
    'Jordan Pickard',
    'CASE-202510-JOR',
    'payment',
    1000.00,
    'Initial Payment',
    '2025-10-08',
    NULL,
    'Initial payment for legal services',
    'Migrated from clients table',
    NOW(),
    NOW()
);

-- 5. Ashley Allen - Quote: $3500.00, Initial Payment: $1200.00
INSERT INTO "public"."financials" ("id", "client_id", "client_name", "case_number", "transaction_type", "amount", "payment_method", "transaction_date", "service_description", "notes", "created_at", "updated_at")
VALUES
(
    gen_random_uuid(),
    '48f85b03-646c-4ac4-8312-af8096467341',
    'Ashley Allen',
    'CASE-202510-ASH',
    'quote',
    3500.00,
    NULL,
    '2025-10-07',
    'Legal services for criminal case - Poss of Meth',
    'Migrated from clients table',
    NOW(),
    NOW()
),
(
    gen_random_uuid(),
    '48f85b03-646c-4ac4-8312-af8096467341',
    'Ashley Allen',
    'CASE-202510-ASH',
    'payment',
    1200.00,
    'Initial Payment',
    '2025-10-07',
    'Initial payment for legal services',
    'Migrated from clients table',
    NOW(),
    NOW()
);

-- 6. Brian Parks - Quote: $750.00 (no initial payment)
INSERT INTO "public"."financials" ("id", "client_id", "client_name", "case_number", "transaction_type", "amount", "transaction_date", "service_description", "notes", "created_at", "updated_at")
VALUES (
    gen_random_uuid(),
    '6601b783-3fda-4bfd-a843-b96cebd1f499',
    'Brian Parks',
    'CASE-202510-BRI',
    'quote',
    750.00,
    '2025-10-13',
    'Legal services for criminal case - 4 Traffic Citations',
    'Migrated from clients table',
    NOW(),
    NOW()
);

-- 7. Hernan Gustavo Peinado - Quote: $7500.00 (no initial payment)
INSERT INTO "public"."financials" ("id", "client_id", "client_name", "case_number", "transaction_type", "amount", "transaction_date", "payment_due_date", "service_description", "notes", "created_at", "updated_at")
VALUES (
    gen_random_uuid(),
    'de08b15a-3932-4930-a718-65b9293c49a5',
    'Hernan Gustavo Peinado',
    'CASE-202510-HER',
    'quote',
    7500.00,
    '2025-10-13',
    '2025-11-25',
    'Legal services for criminal case - Trafficking',
    'Migrated from clients table',
    NOW(),
    NOW()
);

-- Verification query - check the migrated data
-- SELECT client_name, transaction_type, amount, transaction_date
-- FROM financials
-- WHERE client_name IN ('Mason E. Smith', 'Jeremy Nunez', 'Irma Nunez', 'Jordan Pickard', 'Ashley Allen', 'Brian Parks', 'Hernan Gustavo Peinado')
-- ORDER BY client_name, transaction_date;