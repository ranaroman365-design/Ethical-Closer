
-- Fix real_kpi_snapshot: change from security definer to security invoker
DROP VIEW IF EXISTS public.real_kpi_snapshot;
CREATE VIEW public.real_kpi_snapshot WITH (security_invoker = true) AS
SELECT user_id,
    count(*) FILTER (WHERE booked_at IS NOT NULL) AS total_calls,
    CASE
        WHEN (count(*) FILTER (WHERE showed_at IS NOT NULL) + count(*) FILTER (WHERE no_show_at IS NOT NULL)) >= 5
        THEN LEAST(round(((count(*) FILTER (WHERE showed_at IS NOT NULL))::numeric / GREATEST((count(*) FILTER (WHERE showed_at IS NOT NULL) + count(*) FILTER (WHERE no_show_at IS NOT NULL)), 1)::numeric) * 100, 1), 100)
        ELSE NULL
    END AS show_rate,
    CASE
        WHEN count(*) FILTER (WHERE showed_at IS NOT NULL) >= 5
        THEN LEAST(round(((count(*) FILTER (WHERE result = 'won'))::numeric / (count(*) FILTER (WHERE showed_at IS NOT NULL))::numeric) * 100, 1), 100)
        ELSE NULL
    END AS close_rate,
    COALESCE(sum(CASE WHEN result = 'won' THEN revenue ELSE NULL END), 0) AS total_revenue
FROM calls c
WHERE is_simulation = false
GROUP BY user_id;
