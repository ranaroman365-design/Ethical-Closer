
-- 1. Extend availability_slots with visibility fields
ALTER TABLE public.availability_slots
  ADD COLUMN IF NOT EXISTS visibility_status text NOT NULL DEFAULT 'hidden'
    CHECK (visibility_status IN ('hidden', 'visible', 'reserved', 'booked', 'expired')),
  ADD COLUMN IF NOT EXISTS visible_rank integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visible_from timestamptz,
  ADD COLUMN IF NOT EXISTS reserved_until timestamptz,
  ADD COLUMN IF NOT EXISTS reserved_by_lead_id uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'generated'
    CHECK (source IN ('generated', 'manual', 'capacity_engine'));

-- Set all existing active slots to 'hidden' (they'll be replenished into visible)
UPDATE public.availability_slots SET visibility_status = 'hidden' WHERE is_active = true AND current_bookings < max_bookings;
UPDATE public.availability_slots SET visibility_status = 'booked' WHERE current_bookings >= max_bookings;

-- Index for fast public slot queries
CREATE INDEX IF NOT EXISTS idx_availability_slots_visibility
  ON public.availability_slots (visibility_status, date, starts_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_availability_slots_reserved_until
  ON public.availability_slots (reserved_until)
  WHERE reserved_until IS NOT NULL;

-- 2. Booking visibility config table
CREATE TABLE IF NOT EXISTS public.booking_visibility_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text UNIQUE NOT NULL,
  config_value jsonb NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_visibility_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage booking visibility config"
  ON public.booking_visibility_config FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'ops_admin'))
  );

-- Insert default config
INSERT INTO public.booking_visibility_config (config_key, config_value, description) VALUES
  ('scarcity_pattern', '{"day_0": 1, "day_1": 2, "day_2": 3, "day_3_to_7": 2}', 'Max visible slots per day offset from today'),
  ('minimum_lead_time_hours', '4', 'Minimum hours before a slot can be visible or bookable'),
  ('max_visible_slots_total', '10', 'Maximum total visible slots across all days'),
  ('reservation_minutes', '8', 'Minutes a slot is held after selection'),
  ('daily_capacity_default', '6', 'Default daily appointment capacity per operator'),
  ('high_conversion_windows', '["09:30-11:30", "13:00-15:30", "16:00-18:30"]', 'Preferred time windows for visible slots'),
  ('scarcity_mode', '"balanced"', 'conservative / balanced / aggressive')
ON CONFLICT (config_key) DO NOTHING;

-- 3. get_public_booking_slots RPC
CREATE OR REPLACE FUNCTION public.get_public_booking_slots(
  p_timezone text DEFAULT 'Europe/Berlin',
  p_lead_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_hours int := 4;
  v_max_total int := 10;
  v_pattern jsonb;
  v_cutoff timestamptz;
  v_result jsonb := '[]'::jsonb;
  v_day_slots jsonb;
  v_day_offset int;
  v_day_date date;
  v_day_max int;
  v_day_count int;
  v_total_count int := 0;
  v_slot record;
  v_scarcity_label text;
BEGIN
  -- Load config
  SELECT (config_value)::int INTO v_min_hours
    FROM booking_visibility_config WHERE config_key = 'minimum_lead_time_hours';
  SELECT (config_value)::int INTO v_max_total
    FROM booking_visibility_config WHERE config_key = 'max_visible_slots_total';
  SELECT config_value INTO v_pattern
    FROM booking_visibility_config WHERE config_key = 'scarcity_pattern';

  v_min_hours := COALESCE(v_min_hours, 4);
  v_max_total := COALESCE(v_max_total, 10);
  v_pattern := COALESCE(v_pattern, '{"day_0": 1, "day_1": 2, "day_2": 3, "day_3_to_7": 2}'::jsonb);
  v_cutoff := now() + (v_min_hours || ' hours')::interval;

  -- Iterate days 0..13
  FOR v_day_offset IN 0..13 LOOP
    EXIT WHEN v_total_count >= v_max_total;

    v_day_date := CURRENT_DATE + v_day_offset;

    -- Determine max visible for this day
    IF v_day_offset = 0 THEN
      v_day_max := COALESCE((v_pattern->>'day_0')::int, 1);
    ELSIF v_day_offset = 1 THEN
      v_day_max := COALESCE((v_pattern->>'day_1')::int, 2);
    ELSIF v_day_offset = 2 THEN
      v_day_max := COALESCE((v_pattern->>'day_2')::int, 3);
    ELSE
      v_day_max := COALESCE((v_pattern->>'day_3_to_7')::int, 2);
    END IF;

    -- Remaining budget
    v_day_max := LEAST(v_day_max, v_max_total - v_total_count);

    -- Collect visible slots for this day
    v_day_count := 0;
    v_day_slots := '[]'::jsonb;

    FOR v_slot IN
      SELECT id, starts_at, ends_at, slot_type, visible_rank
      FROM availability_slots
      WHERE date = v_day_date
        AND is_active = true
        AND visibility_status = 'visible'
        AND starts_at >= v_cutoff
        AND current_bookings < max_bookings
        AND (reserved_by_lead_id IS NULL OR reserved_by_lead_id = p_lead_id)
      ORDER BY visible_rank ASC, starts_at ASC
      LIMIT v_day_max
    LOOP
      v_day_count := v_day_count + 1;
      v_day_slots := v_day_slots || jsonb_build_object(
        'id', v_slot.id,
        'starts_at', v_slot.starts_at,
        'ends_at', v_slot.ends_at,
        'slot_type', v_slot.slot_type
      );
    END LOOP;

    IF v_day_count > 0 THEN
      -- Scarcity label
      IF v_day_count = 1 THEN
        IF v_day_offset = 0 THEN
          v_scarcity_label := 'Letzter Termin heute';
        ELSE
          v_scarcity_label := 'Nur 1 Termin verfügbar';
        END IF;
      ELSIF v_day_count <= 2 THEN
        v_scarcity_label := 'Nur ' || v_day_count || ' Termine verfügbar';
      ELSE
        v_scarcity_label := v_day_count || ' Termine verfügbar';
      END IF;

      v_result := v_result || jsonb_build_object(
        'date', v_day_date,
        'day_offset', v_day_offset,
        'slots', v_day_slots,
        'visible_count', v_day_count,
        'scarcity_label', v_scarcity_label
      );
      v_total_count := v_total_count + v_day_count;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'days', v_result,
    'total_visible', v_total_count,
    'generated_at', now()
  );
END;
$$;

-- 4. replenish_visible_slots function
CREATE OR REPLACE FUNCTION public.replenish_visible_slots(
  p_target_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pattern jsonb;
  v_min_hours int := 4;
  v_max_total int := 10;
  v_cutoff timestamptz;
  v_day_offset int;
  v_day_date date;
  v_day_max int;
  v_current_visible int;
  v_needed int;
  v_promoted int := 0;
  v_total_promoted int := 0;
  v_slot record;
  v_existing_times timestamptz[];
  v_high_windows jsonb;
  v_time_bucket int; -- 0=morning, 1=midday, 2=afternoon, 3=evening
  v_bucket_counts int[] := ARRAY[0,0,0,0];
  v_slot_hour int;
  v_min_bucket int;
  v_min_bucket_count int;
BEGIN
  -- Load config
  SELECT (config_value)::int INTO v_min_hours
    FROM booking_visibility_config WHERE config_key = 'minimum_lead_time_hours';
  SELECT (config_value)::int INTO v_max_total
    FROM booking_visibility_config WHERE config_key = 'max_visible_slots_total';
  SELECT config_value INTO v_pattern
    FROM booking_visibility_config WHERE config_key = 'scarcity_pattern';
  SELECT config_value INTO v_high_windows
    FROM booking_visibility_config WHERE config_key = 'high_conversion_windows';

  v_min_hours := COALESCE(v_min_hours, 4);
  v_max_total := COALESCE(v_max_total, 10);
  v_pattern := COALESCE(v_pattern, '{"day_0": 1, "day_1": 2, "day_2": 3, "day_3_to_7": 2}'::jsonb);
  v_cutoff := now() + (v_min_hours || ' hours')::interval;

  -- If target date specified, only process that day
  FOR v_day_offset IN 0..13 LOOP
    v_day_date := CURRENT_DATE + v_day_offset;

    -- Skip if target date specified and doesn't match
    IF p_target_date IS NOT NULL AND v_day_date != p_target_date THEN
      CONTINUE;
    END IF;

    -- Determine target visible for this day
    IF v_day_offset = 0 THEN
      v_day_max := COALESCE((v_pattern->>'day_0')::int, 1);
    ELSIF v_day_offset = 1 THEN
      v_day_max := COALESCE((v_pattern->>'day_1')::int, 2);
    ELSIF v_day_offset = 2 THEN
      v_day_max := COALESCE((v_pattern->>'day_2')::int, 3);
    ELSE
      v_day_max := COALESCE((v_pattern->>'day_3_to_7')::int, 2);
    END IF;

    -- Count currently visible slots for this day
    SELECT COUNT(*) INTO v_current_visible
    FROM availability_slots
    WHERE date = v_day_date
      AND is_active = true
      AND visibility_status = 'visible'
      AND starts_at >= v_cutoff
      AND current_bookings < max_bookings;

    v_needed := v_day_max - v_current_visible;
    IF v_needed <= 0 THEN CONTINUE; END IF;

    -- Get existing visible times to avoid duplicates
    SELECT ARRAY_AGG(starts_at) INTO v_existing_times
    FROM availability_slots
    WHERE date = v_day_date
      AND is_active = true
      AND visibility_status = 'visible';

    v_existing_times := COALESCE(v_existing_times, ARRAY[]::timestamptz[]);

    -- Count time buckets of existing visible slots for distribution
    v_bucket_counts := ARRAY[0,0,0,0];
    FOR v_slot IN
      SELECT starts_at FROM availability_slots
      WHERE date = v_day_date AND is_active = true AND visibility_status = 'visible'
    LOOP
      v_slot_hour := EXTRACT(HOUR FROM v_slot.starts_at AT TIME ZONE 'Europe/Berlin');
      IF v_slot_hour < 12 THEN v_bucket_counts[1] := v_bucket_counts[1] + 1;
      ELSIF v_slot_hour < 14 THEN v_bucket_counts[2] := v_bucket_counts[2] + 1;
      ELSIF v_slot_hour < 17 THEN v_bucket_counts[3] := v_bucket_counts[3] + 1;
      ELSE v_bucket_counts[4] := v_bucket_counts[4] + 1;
      END IF;
    END LOOP;

    -- Promote hidden slots to visible, preferring underrepresented time buckets
    -- and high-conversion windows
    v_promoted := 0;
    FOR v_slot IN
      SELECT s.id, s.starts_at,
        EXTRACT(HOUR FROM s.starts_at AT TIME ZONE 'Europe/Berlin') as local_hour
      FROM availability_slots s
      WHERE s.date = v_day_date
        AND s.is_active = true
        AND s.visibility_status = 'hidden'
        AND s.starts_at >= v_cutoff
        AND s.current_bookings < s.max_bookings
        AND s.starts_at != ALL(v_existing_times)
      ORDER BY
        -- Prefer high-conversion windows (9:30-11:30, 13-15:30, 16-18:30)
        CASE
          WHEN EXTRACT(HOUR FROM s.starts_at AT TIME ZONE 'Europe/Berlin') BETWEEN 9 AND 11 THEN 0
          WHEN EXTRACT(HOUR FROM s.starts_at AT TIME ZONE 'Europe/Berlin') BETWEEN 13 AND 15 THEN 0
          WHEN EXTRACT(HOUR FROM s.starts_at AT TIME ZONE 'Europe/Berlin') BETWEEN 16 AND 18 THEN 0
          ELSE 1
        END,
        -- Then distribute across time buckets
        CASE
          WHEN EXTRACT(HOUR FROM s.starts_at AT TIME ZONE 'Europe/Berlin') < 12 THEN v_bucket_counts[1]
          WHEN EXTRACT(HOUR FROM s.starts_at AT TIME ZONE 'Europe/Berlin') < 14 THEN v_bucket_counts[2]
          WHEN EXTRACT(HOUR FROM s.starts_at AT TIME ZONE 'Europe/Berlin') < 17 THEN v_bucket_counts[3]
          ELSE v_bucket_counts[4]
        END,
        s.starts_at ASC
    LOOP
      EXIT WHEN v_promoted >= v_needed;

      UPDATE availability_slots
      SET visibility_status = 'visible',
          visible_rank = v_current_visible + v_promoted + 1,
          visible_from = now(),
          updated_at = now()
      WHERE id = v_slot.id;

      v_promoted := v_promoted + 1;

      -- Update bucket counts for next iteration
      IF v_slot.local_hour < 12 THEN v_bucket_counts[1] := v_bucket_counts[1] + 1;
      ELSIF v_slot.local_hour < 14 THEN v_bucket_counts[2] := v_bucket_counts[2] + 1;
      ELSIF v_slot.local_hour < 17 THEN v_bucket_counts[3] := v_bucket_counts[3] + 1;
      ELSE v_bucket_counts[4] := v_bucket_counts[4] + 1;
      END IF;
    END LOOP;

    v_total_promoted := v_total_promoted + v_promoted;
  END LOOP;

  RETURN jsonb_build_object(
    'promoted', v_total_promoted,
    'timestamp', now()
  );
END;
$$;

-- 5. Release expired reservations
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released int;
BEGIN
  UPDATE availability_slots
  SET visibility_status = 'hidden',
      reserved_until = NULL,
      reserved_by_lead_id = NULL,
      updated_at = now()
  WHERE visibility_status = 'reserved'
    AND reserved_until IS NOT NULL
    AND reserved_until < now();

  GET DIAGNOSTICS v_released = ROW_COUNT;

  -- Replenish after releasing
  IF v_released > 0 THEN
    PERFORM replenish_visible_slots();
  END IF;

  RETURN v_released;
END;
$$;

-- 6. Reserve slot function (atomic)
CREATE OR REPLACE FUNCTION public.reserve_booking_slot(
  p_slot_id uuid,
  p_lead_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_minutes int := 8;
  v_slot record;
  v_reserved_until timestamptz;
BEGIN
  SELECT (config_value)::int INTO v_reservation_minutes
    FROM booking_visibility_config WHERE config_key = 'reservation_minutes';
  v_reservation_minutes := COALESCE(v_reservation_minutes, 8);

  -- Atomic lock
  SELECT * INTO v_slot
  FROM availability_slots
  WHERE id = p_slot_id
    AND is_active = true
    AND visibility_status = 'visible'
    AND current_bookings < max_bookings
  FOR UPDATE SKIP LOCKED;

  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Slot nicht verfügbar');
  END IF;

  -- Check 4h minimum lead time
  IF v_slot.starts_at < now() + interval '4 hours' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Termin liegt zu nah');
  END IF;

  v_reserved_until := now() + (v_reservation_minutes || ' minutes')::interval;

  UPDATE availability_slots
  SET visibility_status = 'reserved',
      reserved_until = v_reserved_until,
      reserved_by_lead_id = p_lead_id,
      updated_at = now()
  WHERE id = p_slot_id;

  RETURN jsonb_build_object(
    'success', true,
    'reserved_until', v_reserved_until,
    'slot_id', p_slot_id
  );
END;
$$;

-- 7. Initial replenishment: promote slots to visible
SELECT public.replenish_visible_slots();
