
-- Sprint 4: Seed employer system depth

-- Add 2 more companies
INSERT INTO companies (id, name, description, contact_email, verified, active) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567891', 'DigitalSales Pro GmbH', 'Führende SaaS-Sales Agentur im DACH-Raum', 'hr@digitalsales-pro.de', true, true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567892', 'CloserAcademy International', 'Internationales Sales-Training & Placement', 'talent@closeracademy.io', true, true)
ON CONFLICT (id) DO NOTHING;

-- Add job postings
INSERT INTO employer_jobs (company_id, title, description, requirements, active) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567891', 'Senior Closer (SaaS)', 'High-Ticket SaaS Closing für Enterprise-Kunden', 'Min. L4, Certification required, 25%+ Close Rate', true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567891', 'Setter Team Lead', 'Aufbau und Führung eines 5-köpfigen Setter-Teams', 'L5+, Team-Erfahrung, Show Rate > 80%', true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567892', 'Remote Closer (DACH)', 'Closing für hochpreisige Coaching-Programme', 'Certified, min. 15 Calls, Close Rate > 20%', true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567892', 'International Sales Rep', 'English-speaking closer for global expansion', 'L4+, English fluent, 10+ Deals', true);

