
-- Sprint 4: Seed employer system depth

-- Add 2 more companies
INSERT INTO companies (id, name, description, contact_email, verified, active) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567891', 'DigitalSales Pro GmbH', 'Führende SaaS-Sales Agentur im DACH-Raum', 'hr@digitalsales-pro.de', true, true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567892', 'CloserAcademy International', 'Internationales Sales-Training & Placement', 'talent@closeracademy.io', true, true);

-- Link employer users (use existing test users as employers)
INSERT INTO company_users (company_id, user_id, role) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567891', '83a7a756-5bf4-44ee-ad04-f597b3832f9e', 'admin'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567892', '39d7f43d-4b27-421c-aa7b-23bf91ce3518', 'admin')
ON CONFLICT DO NOTHING;

-- Add job postings
INSERT INTO employer_jobs (company_id, title, description, requirements, active) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567891', 'Senior Closer (SaaS)', 'High-Ticket SaaS Closing für Enterprise-Kunden', 'Min. L4, Certification required, 25%+ Close Rate', true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567891', 'Setter Team Lead', 'Aufbau und Führung eines 5-köpfigen Setter-Teams', 'L5+, Team-Erfahrung, Show Rate > 80%', true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567892', 'Remote Closer (DACH)', 'Closing für hochpreisige Coaching-Programme', 'Certified, min. 15 Calls, Close Rate > 20%', true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567892', 'International Sales Rep', 'English-speaking closer for global expansion', 'L4+, English fluent, 10+ Deals', true);

-- Save profiles (employers saving certified candidates)
INSERT INTO employer_saved_profiles (company_id, candidate_user_id, saved_by) VALUES
-- TechScale saves Robert and Daniel
((SELECT id FROM companies WHERE name LIKE 'TechScale%' LIMIT 1), '5504f2bc-1478-4174-9e6b-85b28795d36d', (SELECT user_id FROM company_users WHERE company_id = (SELECT id FROM companies WHERE name LIKE 'TechScale%' LIMIT 1) LIMIT 1)),
((SELECT id FROM companies WHERE name LIKE 'TechScale%' LIMIT 1), '366e7808-35c7-4329-bd36-323f0f58361e', (SELECT user_id FROM company_users WHERE company_id = (SELECT id FROM companies WHERE name LIKE 'TechScale%' LIMIT 1) LIMIT 1)),
-- DigitalSales saves Sarah and Marco
('a1b2c3d4-e5f6-7890-abcd-ef1234567891', '0065205e-b2bf-423a-8ca0-38897f6613b5', '83a7a756-5bf4-44ee-ad04-f597b3832f9e'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567891', '15c91e19-1659-4832-9c43-52fa1ae8b91e', '83a7a756-5bf4-44ee-ad04-f597b3832f9e'),
-- CloserAcademy saves Julia
('a1b2c3d4-e5f6-7890-abcd-ef1234567892', '83d5db6a-6850-43b7-8d33-0a3114ff6ad1', '39d7f43d-4b27-421c-aa7b-23bf91ce3518');

-- Additional contact requests
INSERT INTO employer_contacts (company_id, candidate_user_id, sender_id, message, status) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567891', '0065205e-b2bf-423a-8ca0-38897f6613b5', '83a7a756-5bf4-44ee-ad04-f597b3832f9e', 'Wir suchen einen erfahrenen Closer für unser SaaS-Team. Ihre Zertifizierung und KPIs überzeugen uns.', 'sent'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567891', '15c91e19-1659-4832-9c43-52fa1ae8b91e', '83a7a756-5bf4-44ee-ad04-f597b3832f9e', 'Marco, Ihre Close Rate und Performance sind beeindruckend. Können wir sprechen?', 'sent'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567892', '83d5db6a-6850-43b7-8d33-0a3114ff6ad1', '39d7f43d-4b27-421c-aa7b-23bf91ce3518', 'Julia, wir möchten Sie als Director für unsere internationale Expansion gewinnen.', 'sent'),
-- One accepted contact
('a1b2c3d4-e5f6-7890-abcd-ef1234567892', '5504f2bc-1478-4174-9e6b-85b28795d36d', '39d7f43d-4b27-421c-aa7b-23bf91ce3518', 'Robert, als Partner wären Sie ideal für unser Scaling-Programm.', 'accepted');
