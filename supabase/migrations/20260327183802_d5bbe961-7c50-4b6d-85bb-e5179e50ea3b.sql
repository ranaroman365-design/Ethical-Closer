
-- Fix user_level_status for users whose business_stage doesn't match current_level
UPDATE user_level_status SET current_level = 1, current_role_label = 'Trainee', promotion_status = 'not_eligible'
WHERE user_id IN (SELECT id FROM profiles WHERE business_stage = 'opener') AND current_level = 0;

UPDATE user_level_status SET current_level = 2, current_role_label = 'Associate Setter', promotion_status = 'not_eligible'
WHERE user_id IN (SELECT id FROM profiles WHERE business_stage IN ('setter', 'associate_setter')) AND current_level = 0;
