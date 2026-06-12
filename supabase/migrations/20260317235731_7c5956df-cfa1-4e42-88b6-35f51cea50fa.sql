UPDATE leads SET stage = 'assigned_setter' WHERE stage = 'backlog' AND setter_id IS NOT NULL;
UPDATE leads SET stage = 'setter_attempting' WHERE stage = 'contacted' AND setter_id IS NOT NULL;
UPDATE leads SET stage = 'setter_no_response' WHERE stage = 'responded' AND setter_id IS NOT NULL;