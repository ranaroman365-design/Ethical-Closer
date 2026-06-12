UPDATE lead_activation_settings
SET lead_activation_enabled = true,
    test_mode = false,
    updated_at = now()
WHERE scope = 'global' AND funnel_key IS NULL;