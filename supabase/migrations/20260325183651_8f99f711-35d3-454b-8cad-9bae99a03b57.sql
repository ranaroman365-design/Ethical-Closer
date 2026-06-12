
-- Fix start-here: only Level 1 (opener)
UPDATE rooms SET allowed_stages = '{opener}' WHERE slug = 'start-here';

-- Fix objection-handling: visible from L1+ (add opener)
UPDATE rooms SET allowed_stages = '{opener,setter,senior_associate,junior_manager,manager,senior_manager,director,partner}' WHERE slug = 'objection-handling';

-- Fix closing-questions: visible from L3+ (senior_associate)
UPDATE rooms SET allowed_stages = '{senior_associate,junior_manager,manager,senior_manager,director,partner}' WHERE slug = 'closing-questions';

-- Fix advanced-lab: visible from L5+ (manager)
UPDATE rooms SET allowed_stages = '{manager,senior_manager,director,partner}' WHERE slug = 'advanced-lab';

-- Fix tools: visible to ALL levels (L1+)
UPDATE rooms SET allowed_stages = '{opener,setter,senior_associate,junior_manager,manager,senior_manager,director,partner}' WHERE slug = 'tools';

-- Fix inner-circle title for consistency
UPDATE rooms SET allowed_stages = '{partner}' WHERE slug = 'inner-circle';
