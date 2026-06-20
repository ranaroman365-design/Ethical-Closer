-- Sprint 4: Seed employer system depth
-- Safe version for clean dev/staging databases

-- Add 2 more companies
INSERT INTO companies (id, name, description, contact_email, verified, active) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567891', 'DigitalSales Pro GmbH', 'Führende SaaS-Sales Agentur im DACH-Raum', 'hr@digitalsales-pro.de', true, true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567892', 'CloserAcademy International', 'Internationales Sales-Training & Placement', 'talent@closeracademy.io', true, true)
ON CONFLICT (id) DO NOTHING;


-- Link employer users
-- Safe version: only insert when both company and user exist
INSERT INTO company_users (company_id, user_id, role)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid,
  '83a7a756-5bf4-44ee-ad04-f597b3832f9e'::uuid,
  'admin'
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '83a7a756-5bf4-44ee-ad04-f597b3832f9e'::uuid
)
ON CONFLICT DO NOTHING;

INSERT INTO company_users (company_id, user_id, role)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid,
  '39d7f43d-4b27-421c-aa7b-23bf91ce3518'::uuid,
  'admin'
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '39d7f43d-4b27-421c-aa7b-23bf91ce3518'::uuid
)
ON CONFLICT DO NOTHING;


-- Add job postings
-- Safe version: only insert jobs when company exists and same title does not already exist
INSERT INTO employer_jobs (company_id, title, description, requirements, active)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid,
  'Senior Closer (SaaS)',
  'High-Ticket SaaS Closing für Enterprise-Kunden',
  'Min. L4, Certification required, 25%+ Close Rate',
  true
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid
)
AND NOT EXISTS (
  SELECT 1 FROM employer_jobs ej
  WHERE ej.company_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid
    AND ej.title = 'Senior Closer (SaaS)'
);

INSERT INTO employer_jobs (company_id, title, description, requirements, active)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid,
  'Setter Team Lead',
  'Aufbau und Führung eines 5-köpfigen Setter-Teams',
  'L5+, Team-Erfahrung, Show Rate > 80%',
  true
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid
)
AND NOT EXISTS (
  SELECT 1 FROM employer_jobs ej
  WHERE ej.company_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid
    AND ej.title = 'Setter Team Lead'
);

INSERT INTO employer_jobs (company_id, title, description, requirements, active)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid,
  'Remote Closer (DACH)',
  'Closing für hochpreisige Coaching-Programme',
  'Certified, min. 15 Calls, Close Rate > 20%',
  true
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid
)
AND NOT EXISTS (
  SELECT 1 FROM employer_jobs ej
  WHERE ej.company_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid
    AND ej.title = 'Remote Closer (DACH)'
);

INSERT INTO employer_jobs (company_id, title, description, requirements, active)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid,
  'International Sales Rep',
  'English-speaking closer for global expansion',
  'L4+, English fluent, 10+ Deals',
  true
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid
)
AND NOT EXISTS (
  SELECT 1 FROM employer_jobs ej
  WHERE ej.company_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid
    AND ej.title = 'International Sales Rep'
);


-- Save profiles
-- Safe version: only insert when company, candidate, and saved_by user exist

-- TechScale saves Robert
WITH techscale AS (
  SELECT id FROM companies WHERE name LIKE 'TechScale%' LIMIT 1
),
techscale_admin AS (
  SELECT cu.user_id
  FROM company_users cu
  JOIN techscale t ON t.id = cu.company_id
  LIMIT 1
)
INSERT INTO employer_saved_profiles (company_id, candidate_user_id, saved_by)
SELECT
  t.id,
  '5504f2bc-1478-4174-9e6b-85b28795d36d'::uuid,
  a.user_id
FROM techscale t, techscale_admin a
WHERE t.id IS NOT NULL
  AND a.user_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = '5504f2bc-1478-4174-9e6b-85b28795d36d'::uuid
  )
  AND EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = a.user_id
  )
ON CONFLICT DO NOTHING;

-- TechScale saves Daniel
WITH techscale AS (
  SELECT id FROM companies WHERE name LIKE 'TechScale%' LIMIT 1
),
techscale_admin AS (
  SELECT cu.user_id
  FROM company_users cu
  JOIN techscale t ON t.id = cu.company_id
  LIMIT 1
)
INSERT INTO employer_saved_profiles (company_id, candidate_user_id, saved_by)
SELECT
  t.id,
  '366e7808-35c7-4329-bd36-323f0f58361e'::uuid,
  a.user_id
FROM techscale t, techscale_admin a
WHERE t.id IS NOT NULL
  AND a.user_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = '366e7808-35c7-4329-bd36-323f0f58361e'::uuid
  )
  AND EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = a.user_id
  )
ON CONFLICT DO NOTHING;

-- DigitalSales saves Sarah
INSERT INTO employer_saved_profiles (company_id, candidate_user_id, saved_by)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid,
  '0065205e-b2bf-423a-8ca0-38897f6613b5'::uuid,
  '83a7a756-5bf4-44ee-ad04-f597b3832f9e'::uuid
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '0065205e-b2bf-423a-8ca0-38897f6613b5'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '83a7a756-5bf4-44ee-ad04-f597b3832f9e'::uuid
)
ON CONFLICT DO NOTHING;

-- DigitalSales saves Marco
INSERT INTO employer_saved_profiles (company_id, candidate_user_id, saved_by)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid,
  '15c91e19-1659-4832-9c43-52fa1ae8b91e'::uuid,
  '83a7a756-5bf4-44ee-ad04-f597b3832f9e'::uuid
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '15c91e19-1659-4832-9c43-52fa1ae8b91e'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '83a7a756-5bf4-44ee-ad04-f597b3832f9e'::uuid
)
ON CONFLICT DO NOTHING;

-- CloserAcademy saves Julia
INSERT INTO employer_saved_profiles (company_id, candidate_user_id, saved_by)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid,
  '83d5db6a-6850-43b7-8d33-0a3114ff6ad1'::uuid,
  '39d7f43d-4b27-421c-aa7b-23bf91ce3518'::uuid
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '83d5db6a-6850-43b7-8d33-0a3114ff6ad1'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '39d7f43d-4b27-421c-aa7b-23bf91ce3518'::uuid
)
ON CONFLICT DO NOTHING;


-- Additional contact requests
-- Safe version: only insert when company, candidate, and sender user exist

INSERT INTO employer_contacts (company_id, candidate_user_id, sender_id, message, status)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid,
  '0065205e-b2bf-423a-8ca0-38897f6613b5'::uuid,
  '83a7a756-5bf4-44ee-ad04-f597b3832f9e'::uuid,
  'Wir suchen einen erfahrenen Closer für unser SaaS-Team. Ihre Zertifizierung und KPIs überzeugen uns.',
  'sent'
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '0065205e-b2bf-423a-8ca0-38897f6613b5'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '83a7a756-5bf4-44ee-ad04-f597b3832f9e'::uuid
)
ON CONFLICT DO NOTHING;

INSERT INTO employer_contacts (company_id, candidate_user_id, sender_id, message, status)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid,
  '15c91e19-1659-4832-9c43-52fa1ae8b91e'::uuid,
  '83a7a756-5bf4-44ee-ad04-f597b3832f9e'::uuid,
  'Marco, Ihre Close Rate und Performance sind beeindruckend. Können wir sprechen?',
  'sent'
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '15c91e19-1659-4832-9c43-52fa1ae8b91e'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '83a7a756-5bf4-44ee-ad04-f597b3832f9e'::uuid
)
ON CONFLICT DO NOTHING;

INSERT INTO employer_contacts (company_id, candidate_user_id, sender_id, message, status)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid,
  '83d5db6a-6850-43b7-8d33-0a3114ff6ad1'::uuid,
  '39d7f43d-4b27-421c-aa7b-23bf91ce3518'::uuid,
  'Julia, wir möchten Sie als Director für unsere internationale Expansion gewinnen.',
  'sent'
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '83d5db6a-6850-43b7-8d33-0a3114ff6ad1'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '39d7f43d-4b27-421c-aa7b-23bf91ce3518'::uuid
)
ON CONFLICT DO NOTHING;

INSERT INTO employer_contacts (company_id, candidate_user_id, sender_id, message, status)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid,
  '5504f2bc-1478-4174-9e6b-85b28795d36d'::uuid,
  '39d7f43d-4b27-421c-aa7b-23bf91ce3518'::uuid,
  'Robert, als Partner wären Sie ideal für unser Scaling-Programm.',
  'accepted'
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567892'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '5504f2bc-1478-4174-9e6b-85b28795d36d'::uuid
)
AND EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = '39d7f43d-4b27-421c-aa7b-23bf91ce3518'::uuid
)
ON CONFLICT DO NOTHING;