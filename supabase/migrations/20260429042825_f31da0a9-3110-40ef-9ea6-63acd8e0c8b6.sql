
-- Phase 7 cleanup — Layer 49 trigger verification
DELETE FROM public.landing_page_snapshots       WHERE related_test_key IN ('__layer49_keep__','__layer49_winner__');
DELETE FROM public.experiment_iteration_queue   WHERE parent_test_key  IN ('__layer49_keep__','__layer49_winner__');
DELETE FROM public.experiment_learnings         WHERE test_key         IN ('__layer49_keep__','__layer49_winner__');
DELETE FROM public.experiment_decisions         WHERE test_key         IN ('__layer49_keep__','__layer49_winner__');
DELETE FROM public.experiments                  WHERE name LIKE '__layer49_%';
