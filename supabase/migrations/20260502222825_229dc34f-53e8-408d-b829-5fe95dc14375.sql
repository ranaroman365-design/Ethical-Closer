
-- Reset Daniel's test account password to "TestDaniel2026!"
UPDATE auth.users 
SET encrypted_password = crypt('TestDaniel2026!', gen_salt('bf'))
WHERE id = '366e7808-35c7-4329-bd36-323f0f58361e';
