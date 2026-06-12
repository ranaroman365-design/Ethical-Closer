
-- Remove legacy CASE fallback from auto_welcome_community
CREATE OR REPLACE FUNCTION public.auto_welcome_community()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_community text;
  v_new_community text;
  v_name text;
  v_admin_id uuid;
  v_already_welcomed boolean;
  v_product_key text;
  v_config jsonb;
  v_community_map jsonb;
BEGIN
  IF OLD.business_stage IS NOT DISTINCT FROM NEW.business_stage THEN
    RETURN NEW;
  END IF;

  v_product_key := get_user_product_key(NEW.id);
  SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;

  IF v_config IS NULL OR NOT (v_config ? 'community_mapping') THEN
    INSERT INTO audit_logs (action, source_type, note, after_state)
    VALUES ('auto_welcome_failed', 'system',
      format('No community_mapping in product_config for product=%s — skipped', v_product_key),
      jsonb_build_object('user_id', NEW.id, 'product_key', v_product_key, 'new_stage', NEW.business_stage));
    RETURN NEW;
  END IF;

  v_community_map := v_config->'community_mapping';
  v_old_community := v_community_map->>OLD.business_stage;
  v_new_community := v_community_map->>NEW.business_stage;

  IF v_new_community IS NULL THEN
    INSERT INTO audit_logs (action, source_type, note, after_state)
    VALUES ('auto_welcome_unmapped', 'system',
      format('Stage "%s" not found in community_mapping for product=%s', NEW.business_stage, v_product_key),
      jsonb_build_object('user_id', NEW.id, 'product_key', v_product_key, 'stage', NEW.business_stage));
    RETURN NEW;
  END IF;

  IF v_old_community IS NOT DISTINCT FROM v_new_community THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM community_messages
    WHERE message_type = 'system'
      AND community_type = v_new_community
      AND content LIKE '%' || NEW.id::text || '%'
  ) INTO v_already_welcomed;

  IF v_already_welcomed THEN RETURN NEW; END IF;

  v_name := COALESCE(NEW.full_name, 'Ein neues Mitglied');
  SELECT ur.user_id INTO v_admin_id FROM user_roles ur WHERE ur.role = 'admin' LIMIT 1;
  IF v_admin_id IS NULL THEN v_admin_id := NEW.id; END IF;

  INSERT INTO community_messages (user_id, community_type, message_type, content, post_category)
  VALUES (v_admin_id, v_new_community, 'system',
    'Willkommen ' || v_name || ' in der Community! 👋 [user:' || NEW.id::text || ']',
    'motivation');

  RETURN NEW;
END;
$function$;

-- Clean up duplicate promote_user if exists (drop old void version)
DO $$ BEGIN
  -- Drop any promote_user that returns void (old version)
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'promote_user'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND pg_get_function_result(oid) = 'void'
  ) THEN
    DROP FUNCTION public.promote_user(uuid, integer);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
