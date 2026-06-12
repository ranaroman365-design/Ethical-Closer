// Twilio Environment Validation — checks all required secrets and returns diagnostics.
// Called before activation or from admin UI to verify readiness.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

interface CheckResult {
  key: string;
  status: 'ok' | 'missing' | 'invalid';
  hint?: string;
}

function checkEnv(key: string, validate?: (v: string) => boolean, hint?: string): CheckResult {
  const val = Deno.env.get(key);
  if (!val || val.trim() === '') return { key, status: 'missing', hint: hint ?? `${key} ist nicht gesetzt.` };
  if (validate && !validate(val.trim())) return { key, status: 'invalid', hint: hint ?? `${key} hat ein ungültiges Format.` };
  return { key, status: 'ok' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const checks: CheckResult[] = [
      // Connector gateway keys
      checkEnv('LOVABLE_API_KEY', undefined, 'LOVABLE_API_KEY fehlt — Connector-Gateway funktioniert nicht.'),
      checkEnv('TWILIO_API_KEY', undefined, 'TWILIO_API_KEY fehlt — Twilio-Connector ist nicht verbunden.'),

      // Direct Twilio credentials (used by dispatch-communication)
      checkEnv('TWILIO_AUTH_TOKEN', undefined, 'TWILIO_AUTH_TOKEN fehlt — Direct-API-Calls nicht möglich.'),
      checkEnv('TWILIO_ACCOUNT_SID', undefined, 'TWILIO_ACCOUNT_SID fehlt — Direct-API-Calls nicht möglich.'),

      // From numbers
      checkEnv(
        'TWILIO_WHATSAPP_FROM',
        (v) => E164_REGEX.test(v.replace('whatsapp:', '')),
        'TWILIO_WHATSAPP_FROM fehlt oder ungültig. Format: +49... oder whatsapp:+49...',
      ),
      checkEnv(
        'TWILIO_SMS_FROM',
        (v) => E164_REGEX.test(v),
        'TWILIO_SMS_FROM fehlt oder ungültig. Format: +49...',
      ),
    ];

    const allOk = checks.every((c) => c.status === 'ok');
    const critical = checks.filter((c) => c.status !== 'ok');
    const whatsappReady = checks.find((c) => c.key === 'TWILIO_WHATSAPP_FROM')?.status === 'ok';
    const smsReady = checks.find((c) => c.key === 'TWILIO_SMS_FROM')?.status === 'ok';

    // Determine which send paths are functional
    const connectorReady =
      checks.find((c) => c.key === 'LOVABLE_API_KEY')?.status === 'ok' &&
      checks.find((c) => c.key === 'TWILIO_API_KEY')?.status === 'ok';
    const directReady =
      checks.find((c) => c.key === 'TWILIO_AUTH_TOKEN')?.status === 'ok' &&
      checks.find((c) => c.key === 'TWILIO_ACCOUNT_SID')?.status === 'ok';

    const result = {
      ready: allOk,
      whatsapp_ready: whatsappReady && (connectorReady || directReady),
      sms_ready: smsReady && (connectorReady || directReady),
      connector_gateway_ready: connectorReady,
      direct_api_ready: directReady,
      checks,
      critical_issues: critical,
      activation_blocked: !whatsappReady,
      activation_blocked_reason: !whatsappReady
        ? 'TWILIO_WHATSAPP_FROM fehlt oder ungültig — Aktivierung gesperrt.'
        : null,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
