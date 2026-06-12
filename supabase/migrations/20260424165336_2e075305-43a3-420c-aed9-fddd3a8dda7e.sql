-- Extend get_apply_ab_results to include the holdout bucket "H".
-- Same Wilson 95% CI + two-proportion Z-test logic; "z_*_vs_other" now compares
-- each row against the COMBINED other variants (so H can be benchmarked vs A+B
-- and A vs B+H, etc.). Holdout is included as a third row.

create or replace function public.get_apply_ab_results(p_test_key text default 'social_proof_v1')
returns table (
  variant text,
  assigned bigint,
  cta_clicks bigint,
  bookings bigint,
  ctr numeric,
  booking_rate numeric,
  ctr_ci_low numeric,
  ctr_ci_high numeric,
  booking_ci_low numeric,
  booking_ci_high numeric,
  z_ctr_vs_other numeric,
  z_booking_vs_other numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  z constant numeric := 1.96;
begin
  if not has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;

  return query
  with assigns as (
    select
      coalesce(payload->>'ab_variant','A') as variant,
      coalesce(payload->>'user_id', email, id::text) as subject
    from event_logs
    where event_name = 'apply_ab_assigned'
      and (payload->>'ab_test' = p_test_key or payload->>'test' = p_test_key)
  ),
  clicks as (
    select
      coalesce(payload->>'ab_variant','A') as variant,
      coalesce(payload->>'user_id', email, id::text) as subject
    from event_logs
    where event_name = 'apply_cta_click'
      and payload->>'ab_test' = p_test_key
  ),
  booking_emails as (
    select distinct email
    from event_logs
    where event_name in ('booking_created','appointment_booked','quiz_booked')
      and email is not null
  ),
  variant_emails as (
    select distinct
      coalesce(payload->>'ab_variant','A') as variant,
      email
    from event_logs
    where event_name = 'apply_ab_assigned'
      and (payload->>'ab_test' = p_test_key or payload->>'test' = p_test_key)
      and email is not null
  ),
  agg as (
    select
      v.variant,
      (select count(distinct subject) from assigns a where a.variant = v.variant) as assigned,
      (select count(distinct subject) from clicks c where c.variant = v.variant) as cta_clicks,
      (select count(distinct ve.email)
         from variant_emails ve
         join booking_emails be on be.email = ve.email
         where ve.variant = v.variant) as bookings
    from (values ('A'),('B'),('H')) as v(variant)
  )
  select
    a.variant,
    a.assigned,
    a.cta_clicks,
    a.bookings,
    case when a.assigned = 0 then 0
         else round(a.cta_clicks::numeric / a.assigned, 4) end as ctr,
    case when a.assigned = 0 then 0
         else round(a.bookings::numeric / a.assigned, 4) end as booking_rate,
    -- Wilson 95% CI for CTR
    case when a.assigned = 0 then 0 else
      round(
        ((a.cta_clicks::numeric / a.assigned) + (z*z)/(2*a.assigned)
         - z * sqrt(((a.cta_clicks::numeric / a.assigned) * (1 - (a.cta_clicks::numeric / a.assigned)) + (z*z)/(4*a.assigned)) / a.assigned)
        ) / (1 + (z*z)/a.assigned), 4)
    end as ctr_ci_low,
    case when a.assigned = 0 then 0 else
      round(
        ((a.cta_clicks::numeric / a.assigned) + (z*z)/(2*a.assigned)
         + z * sqrt(((a.cta_clicks::numeric / a.assigned) * (1 - (a.cta_clicks::numeric / a.assigned)) + (z*z)/(4*a.assigned)) / a.assigned)
        ) / (1 + (z*z)/a.assigned), 4)
    end as ctr_ci_high,
    case when a.assigned = 0 then 0 else
      round(
        ((a.bookings::numeric / a.assigned) + (z*z)/(2*a.assigned)
         - z * sqrt(((a.bookings::numeric / a.assigned) * (1 - (a.bookings::numeric / a.assigned)) + (z*z)/(4*a.assigned)) / a.assigned)
        ) / (1 + (z*z)/a.assigned), 4)
    end as booking_ci_low,
    case when a.assigned = 0 then 0 else
      round(
        ((a.bookings::numeric / a.assigned) + (z*z)/(2*a.assigned)
         + z * sqrt(((a.bookings::numeric / a.assigned) * (1 - (a.bookings::numeric / a.assigned)) + (z*z)/(4*a.assigned)) / a.assigned)
        ) / (1 + (z*z)/a.assigned), 4)
    end as booking_ci_high,
    -- Two-proportion Z-test vs the COMBINED other buckets
    (
      with other as (
        select sum(assigned) as o_assigned, sum(cta_clicks) as o_clicks, sum(bookings) as o_book
        from agg ag2 where ag2.variant <> a.variant
      )
      select case
        when a.assigned = 0 or coalesce((select o_assigned from other),0) = 0 then null
        when ((a.cta_clicks + (select o_clicks from other))::numeric
              / nullif((a.assigned + (select o_assigned from other)),0)) in (0,1) then null
        else round(
          ((a.cta_clicks::numeric / a.assigned)
            - ((select o_clicks from other)::numeric / (select o_assigned from other)))
          / sqrt(
            ((a.cta_clicks + (select o_clicks from other))::numeric / (a.assigned + (select o_assigned from other)))
            * (1 - ((a.cta_clicks + (select o_clicks from other))::numeric / (a.assigned + (select o_assigned from other))))
            * (1.0/a.assigned + 1.0/(select o_assigned from other))
          ), 3)
      end
    ) as z_ctr_vs_other,
    (
      with other as (
        select sum(assigned) as o_assigned, sum(bookings) as o_book
        from agg ag2 where ag2.variant <> a.variant
      )
      select case
        when a.assigned = 0 or coalesce((select o_assigned from other),0) = 0 then null
        when ((a.bookings + (select o_book from other))::numeric
              / nullif((a.assigned + (select o_assigned from other)),0)) in (0,1) then null
        else round(
          ((a.bookings::numeric / a.assigned)
            - ((select o_book from other)::numeric / (select o_assigned from other)))
          / sqrt(
            ((a.bookings + (select o_book from other))::numeric / (a.assigned + (select o_assigned from other)))
            * (1 - ((a.bookings + (select o_book from other))::numeric / (a.assigned + (select o_assigned from other))))
            * (1.0/a.assigned + 1.0/(select o_assigned from other))
          ), 3)
      end
    ) as z_booking_vs_other
  from agg a
  order by case a.variant when 'A' then 1 when 'B' then 2 when 'H' then 3 else 9 end;
end;
$$;