
-- Sprint 2: Seed realistic no-shows and additional calls

-- No-show calls for top performers (~15% rate)
INSERT INTO calls (user_id, call_type, offer_type, status, booked_at, no_show_at, funnel_stage, created_at) VALUES
('5504f2bc-1478-4174-9e6b-85b28795d36d', 'closing', 'high_ticket', 'no_show', now()-interval '18 days', now()-interval '18 days'+interval '1 hour', 'closing_call', now()-interval '18 days'),
('5504f2bc-1478-4174-9e6b-85b28795d36d', 'closing', 'high_ticket', 'no_show', now()-interval '9 days', now()-interval '9 days'+interval '1 hour', 'closing_call', now()-interval '9 days'),
('83d5db6a-6850-43b7-8d33-0a3114ff6ad1', 'closing', 'high_ticket', 'no_show', now()-interval '22 days', now()-interval '22 days'+interval '1 hour', 'closing_call', now()-interval '22 days'),
('83d5db6a-6850-43b7-8d33-0a3114ff6ad1', 'closing', 'mid_ticket', 'no_show', now()-interval '6 days', now()-interval '6 days'+interval '1 hour', 'closing_call', now()-interval '6 days'),
('366e7808-35c7-4329-bd36-323f0f58361e', 'closing', 'high_ticket', 'no_show', now()-interval '15 days', now()-interval '15 days'+interval '1 hour', 'closing_call', now()-interval '15 days'),
('366e7808-35c7-4329-bd36-323f0f58361e', 'closing', 'mid_ticket', 'no_show', now()-interval '3 days', now()-interval '3 days'+interval '1 hour', 'closing_call', now()-interval '3 days');

-- Marco (L4) - 9 additional calls (7+9=16 total)
INSERT INTO calls (user_id, call_type, offer_type, status, booked_at, showed_at, closed_at, result, revenue, deal_size, funnel_stage, created_at) VALUES
('15c91e19-1659-4832-9c43-52fa1ae8b91e', 'closing', 'mid_ticket', 'closed_won', now()-interval '30 days', now()-interval '30 days'+interval '30 min', now()-interval '30 days'+interval '60 min', 'won', 4500, 4500, 'closing_call', now()-interval '30 days'),
('15c91e19-1659-4832-9c43-52fa1ae8b91e', 'closing', 'mid_ticket', 'closed_lost', now()-interval '27 days', now()-interval '27 days'+interval '30 min', now()-interval '27 days'+interval '55 min', 'lost', 0, 3500, 'closing_call', now()-interval '27 days'),
('15c91e19-1659-4832-9c43-52fa1ae8b91e', 'closing', 'high_ticket', 'closed_won', now()-interval '24 days', now()-interval '24 days'+interval '25 min', now()-interval '24 days'+interval '50 min', 'won', 7000, 7000, 'closing_call', now()-interval '24 days'),
('15c91e19-1659-4832-9c43-52fa1ae8b91e', 'closing', 'mid_ticket', 'closed_won', now()-interval '21 days', now()-interval '21 days'+interval '20 min', now()-interval '21 days'+interval '45 min', 'won', 3800, 3800, 'closing_call', now()-interval '21 days'),
('15c91e19-1659-4832-9c43-52fa1ae8b91e', 'closing', 'mid_ticket', 'no_show', now()-interval '19 days', now()-interval '19 days'+interval '1 hour', NULL, NULL, NULL, 4000, 'closing_call', now()-interval '19 days'),
('15c91e19-1659-4832-9c43-52fa1ae8b91e', 'closing', 'high_ticket', 'closed_won', now()-interval '16 days', now()-interval '16 days'+interval '30 min', now()-interval '16 days'+interval '55 min', 'won', 8500, 8500, 'closing_call', now()-interval '16 days'),
('15c91e19-1659-4832-9c43-52fa1ae8b91e', 'closing', 'mid_ticket', 'closed_lost', now()-interval '13 days', now()-interval '13 days'+interval '25 min', now()-interval '13 days'+interval '50 min', 'lost', 0, 3000, 'closing_call', now()-interval '13 days'),
('15c91e19-1659-4832-9c43-52fa1ae8b91e', 'closing', 'mid_ticket', 'closed_won', now()-interval '10 days', now()-interval '10 days'+interval '20 min', now()-interval '10 days'+interval '40 min', 'won', 4200, 4200, 'closing_call', now()-interval '10 days'),
('15c91e19-1659-4832-9c43-52fa1ae8b91e', 'closing', 'high_ticket', 'no_show', now()-interval '7 days', now()-interval '7 days'+interval '1 hour', NULL, NULL, NULL, 6000, 'closing_call', now()-interval '7 days');

-- Anna (L3) - 8 additional calls
INSERT INTO calls (user_id, call_type, offer_type, status, booked_at, showed_at, closed_at, result, revenue, deal_size, funnel_stage, created_at) VALUES
('5ca9b064-9f21-4a1f-ad12-e2f8cc47ae1d', 'closing', 'mid_ticket', 'closed_won', now()-interval '28 days', now()-interval '28 days'+interval '25 min', now()-interval '28 days'+interval '55 min', 'won', 3200, 3200, 'closing_call', now()-interval '28 days'),
('5ca9b064-9f21-4a1f-ad12-e2f8cc47ae1d', 'closing', 'mid_ticket', 'closed_lost', now()-interval '25 days', now()-interval '25 days'+interval '30 min', now()-interval '25 days'+interval '50 min', 'lost', 0, 4000, 'closing_call', now()-interval '25 days'),
('5ca9b064-9f21-4a1f-ad12-e2f8cc47ae1d', 'closing', 'high_ticket', 'closed_won', now()-interval '20 days', now()-interval '20 days'+interval '20 min', now()-interval '20 days'+interval '45 min', 'won', 6500, 6500, 'closing_call', now()-interval '20 days'),
('5ca9b064-9f21-4a1f-ad12-e2f8cc47ae1d', 'closing', 'mid_ticket', 'no_show', now()-interval '17 days', now()-interval '17 days'+interval '1 hour', NULL, NULL, NULL, 3500, 'closing_call', now()-interval '17 days'),
('5ca9b064-9f21-4a1f-ad12-e2f8cc47ae1d', 'closing', 'mid_ticket', 'closed_won', now()-interval '14 days', now()-interval '14 days'+interval '25 min', now()-interval '14 days'+interval '50 min', 'won', 4800, 4800, 'closing_call', now()-interval '14 days'),
('5ca9b064-9f21-4a1f-ad12-e2f8cc47ae1d', 'closing', 'mid_ticket', 'closed_lost', now()-interval '11 days', now()-interval '11 days'+interval '20 min', now()-interval '11 days'+interval '45 min', 'lost', 0, 3800, 'closing_call', now()-interval '11 days'),
('5ca9b064-9f21-4a1f-ad12-e2f8cc47ae1d', 'closing', 'high_ticket', 'closed_won', now()-interval '8 days', now()-interval '8 days'+interval '25 min', now()-interval '8 days'+interval '50 min', 'won', 5500, 5500, 'closing_call', now()-interval '8 days'),
('5ca9b064-9f21-4a1f-ad12-e2f8cc47ae1d', 'closing', 'mid_ticket', 'no_show', now()-interval '5 days', now()-interval '5 days'+interval '1 hour', NULL, NULL, NULL, 4200, 'closing_call', now()-interval '5 days');

-- Sarah Managing-Closer (L5) - 7 additional calls
INSERT INTO calls (user_id, call_type, offer_type, status, booked_at, showed_at, closed_at, result, revenue, deal_size, funnel_stage, created_at) VALUES
('0065205e-b2bf-423a-8ca0-38897f6613b5', 'closing', 'high_ticket', 'closed_won', now()-interval '26 days', now()-interval '26 days'+interval '25 min', now()-interval '26 days'+interval '55 min', 'won', 9000, 9000, 'closing_call', now()-interval '26 days'),
('0065205e-b2bf-423a-8ca0-38897f6613b5', 'closing', 'mid_ticket', 'closed_lost', now()-interval '23 days', now()-interval '23 days'+interval '30 min', now()-interval '23 days'+interval '50 min', 'lost', 0, 5000, 'closing_call', now()-interval '23 days'),
('0065205e-b2bf-423a-8ca0-38897f6613b5', 'closing', 'high_ticket', 'closed_won', now()-interval '18 days', now()-interval '18 days'+interval '20 min', now()-interval '18 days'+interval '45 min', 'won', 7500, 7500, 'closing_call', now()-interval '18 days'),
('0065205e-b2bf-423a-8ca0-38897f6613b5', 'closing', 'mid_ticket', 'no_show', now()-interval '15 days', now()-interval '15 days'+interval '1 hour', NULL, NULL, NULL, 4500, 'closing_call', now()-interval '15 days'),
('0065205e-b2bf-423a-8ca0-38897f6613b5', 'closing', 'high_ticket', 'closed_won', now()-interval '12 days', now()-interval '12 days'+interval '25 min', now()-interval '12 days'+interval '50 min', 'won', 8200, 8200, 'closing_call', now()-interval '12 days'),
('0065205e-b2bf-423a-8ca0-38897f6613b5', 'closing', 'mid_ticket', 'closed_won', now()-interval '9 days', now()-interval '9 days'+interval '20 min', now()-interval '9 days'+interval '40 min', 'won', 3800, 3800, 'closing_call', now()-interval '9 days'),
('0065205e-b2bf-423a-8ca0-38897f6613b5', 'closing', 'high_ticket', 'no_show', now()-interval '4 days', now()-interval '4 days'+interval '1 hour', NULL, NULL, NULL, 7000, 'closing_call', now()-interval '4 days');

-- Tom Setter (L2) - 5 additional calls
INSERT INTO calls (user_id, call_type, offer_type, status, booked_at, showed_at, closed_at, result, revenue, deal_size, funnel_stage, created_at) VALUES
('e37a93c6-46d7-4aa3-a581-73bfbe299ce3', 'setter', 'mid_ticket', 'closed_won', now()-interval '22 days', now()-interval '22 days'+interval '15 min', now()-interval '22 days'+interval '30 min', 'won', 3500, 3500, 'setter_call', now()-interval '22 days'),
('e37a93c6-46d7-4aa3-a581-73bfbe299ce3', 'setter', 'mid_ticket', 'closed_lost', now()-interval '18 days', now()-interval '18 days'+interval '15 min', now()-interval '18 days'+interval '25 min', 'lost', 0, 3000, 'setter_call', now()-interval '18 days'),
('e37a93c6-46d7-4aa3-a581-73bfbe299ce3', 'setter', 'mid_ticket', 'no_show', now()-interval '14 days', now()-interval '14 days'+interval '1 hour', NULL, NULL, NULL, 2500, 'setter_call', now()-interval '14 days'),
('e37a93c6-46d7-4aa3-a581-73bfbe299ce3', 'setter', 'mid_ticket', 'closed_won', now()-interval '10 days', now()-interval '10 days'+interval '15 min', now()-interval '10 days'+interval '30 min', 'won', 4000, 4000, 'setter_call', now()-interval '10 days'),
('e37a93c6-46d7-4aa3-a581-73bfbe299ce3', 'setter', 'mid_ticket', 'closed_won', now()-interval '6 days', now()-interval '6 days'+interval '15 min', now()-interval '6 days'+interval '30 min', 'won', 2800, 2800, 'setter_call', now()-interval '6 days');
