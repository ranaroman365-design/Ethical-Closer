-- Rename Philosophy room to Mission
UPDATE rooms SET title = 'Mission' WHERE slug = 'philosophy';

-- Rename Career Path room to Karriereweg and ensure ALL stages have access
UPDATE rooms SET title = 'Karriereweg', allowed_stages = ARRAY['prospect','opener','setter','senior_associate','junior_manager','manager','senior_manager','director','partner'] WHERE slug = 'career-path';
