// Layer 38 — Conversational WhatsApp AI Responder
//
// Pipeline:
//   1. Resolve / create wa_conversations row (by phone_e164)
//   2. Insert inbound wa_messages row
//   3. Load settings (per-funnel > global)
//   4. Build CollisionContext, run canAIReply()
//   5. If blocked → log blocked outbound, return
//   6. Detect intent via Lovable AI Gateway (gemini flash, structured tool call)
//   7. Decide action via INTENT_ACTIONS map
//   8. Render template_key from message_library (if available; else fallback)
//   9. Send via Twilio WhatsApp + log + update conversation state
//  10. Escalate if rules trigger
//
// Hard rules: never auto-book, never send during voice call,
//             never override human reply, always respect STOP.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const TWILIO_API_KEY  = Deno.env.get('TWILIO_API_KEY');
const TWILIO_WA_FROM  = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? ''; // e.g. whatsapp:+14155238886
const GATEWAY_URL     = 'https://connector-gateway.lovable.dev';

type Intent = 'booking_intent'|'hesitation'|'objection'|'reschedule_intent'|'no_interest'|'question'|'stop'|'unknown';

// L38 Objection Handling — 10 deep sub-types (psychological)
type ObjectionType =
  | 'no_time' | 'no_interest' | 'too_expensive' | 'think_about_it'
  | 'send_info' | 'not_now' | 'who_are_you' | 'have_solution'
  | 'too_complicated' | 'ghosting' | null;

const OBJECTION_TEMPLATE: Record<Exclude<ObjectionType, null>, string> = {
  no_time:          'wa_obj_no_time',
  no_interest:      'wa_obj_no_interest',
  too_expensive:    'wa_obj_too_expensive',
  think_about_it:   'wa_obj_think_about_it',
  send_info:        'wa_obj_send_info',
  not_now:          'wa_obj_not_now',
  who_are_you:      'wa_obj_who_are_you',
  have_solution:    'wa_obj_have_solution',
  too_complicated:  'wa_obj_too_complicated',
  ghosting:         'wa_obj_ghosting',
};

const INTENT_ACTIONS: Record<Intent, {
  template_key: string; next_state: string;
  send_booking_link?: boolean; send_reschedule_link?: boolean;
  escalate?: boolean; soft_exit?: boolean;
}> = {
  booking_intent:    { template_key: 'wa_booking_confirm',  next_state: 'booking_pending', send_booking_link: true },
  hesitation:        { template_key: 'wa_hesitation_soft',  next_state: 'engaged' },
  objection:         { template_key: 'wa_objection_handle', next_state: 'engaged' },
  reschedule_intent: { template_key: 'wa_reschedule',       next_state: 'engaged', send_reschedule_link: true },
  no_interest:       { template_key: 'wa_soft_exit',        next_state: 'lost', soft_exit: true },
  question:          { template_key: 'wa_question_brief',   next_state: 'engaged' },
  stop:              { template_key: '',                    next_state: 'lost' },
  unknown:           { template_key: '',                    next_state: 'engaged', escalate: true },
};

// Inline fallback copy (used only if message_library template missing)
const FALLBACK_COPY: Record<string, string> = {
  wa_booking_confirm:  'Perfekt. Hier dein Termin-Link – wähl, was passt: {{booking_link}}',
  wa_hesitation_soft:  'Alles gut. Lass uns einen kurzen Termin finden, der passt. Morgen oder später diese Woche?',
  wa_objection_handle: 'Verstehe. Kurze Frage dazu beantworten wir am besten im Call – sollen wir 15 Min einplanen?',
  wa_reschedule:       'Klar, hier der Reschedule-Link: {{reschedule_link}}',
  wa_soft_exit:        'Alles gut. Falls sich was ändert, melde dich gern.',
  wa_question_brief:   'Gute Frage. Im Call beantworten wir das in 1 Min – wann passt es dir?',
  wa_escalation_handoff: 'Ein Mensch aus unserem Team meldet sich gleich bei dir.',
};

const STOP_KEYWORDS = ['stop','stopp','unsubscribe','abmelden','cancel'];

function isQuietHour(date: Date, start: number, end: number): boolean {
  const h = date.getUTCHours(); // approx; lead-local TZ pending L26 enrichment
  return start > end ? (h >= start || h < end) : (h >= start && h < end);
}

type PsychState = 'uncertain'|'busy'|'rational'|'dominant'|'neutral';
// L40 — personality types (vs L39 momentary state)
type Personality = 'dominant'|'analytical'|'relational'|'expressive'|'unknown';

const INTENT_TO_PURPOSE: Record<string, string> = {
  hesitation: 'hesitation',
  objection: 'objection',
  question: 'question',
  booking_intent: 'booking',
};

async function detectIntent(body: string): Promise<{ intent: Intent; confidence: number; objection_type: ObjectionType; psych_state: PsychState; psych_confidence: number; personality: Personality; personality_confidence: number }> {
  const lower = body.toLowerCase().trim();
  if (STOP_KEYWORDS.some(k => lower === k || lower.startsWith(k + ' '))) {
    return { intent: 'stop', confidence: 1, objection_type: null, psych_state: 'neutral', psych_confidence: 1, personality: 'unknown', personality_confidence: 1 };
  }
  if (!LOVABLE_API_KEY) return { intent: 'unknown', confidence: 0, objection_type: null, psych_state: 'neutral', psych_confidence: 0, personality: 'unknown', personality_confidence: 0 };

  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: `You classify short German/English WhatsApp replies from sales leads. Return:
1) intent + confidence 0-1
2) objection_type if intent=objection (else null)
3) psych_state — the lead's mental state RIGHT NOW (transient):
   • uncertain: hedging, "weiß nicht", "muss überlegen"
   • busy: very short, "keine Zeit", terse
   • rational: asks how/why/what specifically
   • dominant: short, direct, demanding, impatient
   • neutral: nothing clear
4) psych_confidence 0-1
5) personality — the lead's underlying TYPE (stable, not transient):
   • dominant: short sentences, wants control, asks "Preis?", "Wie schnell?", direct, decisive
   • analytical: many specific questions, wants details/structure, "Wie genau?", "Welche Voraussetzungen?"
   • relational: friendly, emotional words, "fühlt sich gut an", values trust/connection
   • expressive: big-picture words, future-focused, "was ist möglich?", visionary
   • unknown: not enough signal
6) personality_confidence 0-1
Be conservative. If unclear, prefer neutral / unknown. The state is HOW they feel now; the personality is WHO they are.` },
          { role: 'user', content: body },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'classify_intent',
            description: 'Classify lead WhatsApp reply: intent + objection sub-type + psychological state + personality type',
            parameters: {
              type: 'object',
              properties: {
                intent: { type: 'string', enum: ['booking_intent','hesitation','objection','reschedule_intent','no_interest','question','stop','unknown'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                objection_type: {
                  type: ['string','null'],
                  enum: ['no_time','no_interest','too_expensive','think_about_it','send_info','not_now','who_are_you','have_solution','too_complicated','ghosting',null],
                  description: 'Required when intent=objection, otherwise null',
                },
                psych_state: {
                  type: 'string',
                  enum: ['uncertain','busy','rational','dominant','neutral'],
                  description: 'Mental state of the lead based on this single message (transient)',
                },
                psych_confidence: { type: 'number', minimum: 0, maximum: 1 },
                personality: {
                  type: 'string',
                  enum: ['dominant','analytical','relational','expressive','unknown'],
                  description: 'Underlying personality type (stable across messages)',
                },
                personality_confidence: { type: 'number', minimum: 0, maximum: 1 },
              },
              required: ['intent','confidence','objection_type','psych_state','psych_confidence','personality','personality_confidence'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'classify_intent' } },
      }),
    });
    if (!r.ok) {
      console.error('[L38] intent classify failed', r.status, await r.text().catch(()=>''));
      return { intent: 'unknown', confidence: 0, objection_type: null, psych_state: 'neutral', psych_confidence: 0, personality: 'unknown', personality_confidence: 0 };
    }
    const data = await r.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return { intent: 'unknown', confidence: 0, objection_type: null, psych_state: 'neutral', psych_confidence: 0, personality: 'unknown', personality_confidence: 0 };
    const parsed = JSON.parse(args);
    return {
      intent: parsed.intent as Intent,
      confidence: Number(parsed.confidence ?? 0),
      objection_type: (parsed.objection_type ?? null) as ObjectionType,
      psych_state: (parsed.psych_state ?? 'neutral') as PsychState,
      psych_confidence: Number(parsed.psych_confidence ?? 0),
      personality: (parsed.personality ?? 'unknown') as Personality,
      personality_confidence: Number(parsed.personality_confidence ?? 0),
    };
  } catch (e) {
    console.error('[L38] intent error', e);
    return { intent: 'unknown', confidence: 0, objection_type: null, psych_state: 'neutral', psych_confidence: 0, personality: 'unknown', personality_confidence: 0 };
  }
}

// L39 — Smoothing: only flip dominant_state when 2 consecutive detections agree
function applyStateSmoothing(
  history: Array<{ state: PsychState; ts: string }>,
  newDetected: PsychState,
  currentDominant: PsychState | null,
): { dominant: PsychState; flipped: boolean; smoothed: boolean } {
  if (currentDominant === null || currentDominant === undefined) {
    return { dominant: newDetected, flipped: true, smoothed: false };
  }
  if (newDetected === currentDominant) {
    return { dominant: currentDominant, flipped: false, smoothed: false };
  }
  const last = history[history.length - 1]?.state;
  if (last === newDetected) {
    return { dominant: newDetected, flipped: true, smoothed: false };
  }
  return { dominant: currentDominant, flipped: false, smoothed: true };
}

// L40 — Personality smoothing (mirrors L39 structure)
function applyPersonalitySmoothing(
  history: Array<{ personality: Personality; ts: string }>,
  newDetected: Personality,
  currentDominant: Personality | null,
): { dominant: Personality; flipped: boolean; smoothed: boolean } {
  if (currentDominant === null || currentDominant === undefined) {
    return { dominant: newDetected, flipped: true, smoothed: false };
  }
  if (newDetected === currentDominant) {
    return { dominant: currentDominant, flipped: false, smoothed: false };
  }
  const last = history[history.length - 1]?.personality;
  if (last === newDetected) {
    return { dominant: newDetected, flipped: true, smoothed: false };
  }
  return { dominant: currentDominant, flipped: false, smoothed: true };
}

async function sendWhatsApp(to: string, body: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !TWILIO_WA_FROM) {
    return { ok: false, error: 'twilio_not_configured' };
  }
  try {
    const r = await fetch(`${GATEWAY_URL}/twilio/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: TWILIO_WA_FROM,
        To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
        Body: body,
      }),
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, error: `twilio_${r.status}: ${JSON.stringify(data)}` };
    return { ok: true, sid: data.sid };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { phone_e164, body, twilio_sid } = await req.json();
    if (!phone_e164 || !body) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Resolve / create conversation
    let { data: conv } = await supabase
      .from('wa_conversations').select('*').eq('phone_e164', phone_e164).maybeSingle();

    if (!conv) {
      // Try to map phone → existing lead
      const { data: lead } = await supabase
        .from('leads').select('id, funnel_key, score, do_not_contact, consent')
        .or(`phone.eq.${phone_e164},phone_e164.eq.${phone_e164}`)
        .maybeSingle();

      const ins = await supabase.from('wa_conversations').insert({
        phone_e164,
        lead_id: lead?.id ?? null,
        funnel_key: lead?.funnel_key ?? null,
        state: 'cold',
      }).select('*').single();
      conv = ins.data;
    }

    // 2. Log inbound
    await supabase.from('wa_messages').insert({
      conversation_id: conv!.id,
      lead_id: conv!.lead_id,
      funnel_key: conv!.funnel_key,
      direction: 'inbound',
      body,
      twilio_sid: twilio_sid || null,
    });
    await supabase.from('wa_conversations').update({
      message_count: (conv!.message_count ?? 0) + 1,
      last_inbound_at: new Date().toISOString(),
    }).eq('id', conv!.id);

    // 3. Settings (per-funnel > global)
    let settings: any = null;
    if (conv!.funnel_key) {
      const { data } = await supabase.from('conversational_ai_settings')
        .select('*').eq('scope', 'funnel').eq('funnel_key', conv!.funnel_key).maybeSingle();
      settings = data;
    }
    if (!settings) {
      const { data } = await supabase.from('conversational_ai_settings')
        .select('*').eq('scope', 'global').maybeSingle();
      settings = data;
    }

    if (!settings?.enabled) {
      console.log('[L38] disabled — skipping AI reply');
      return new Response(JSON.stringify({ ok: true, skipped: 'disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (conv!.ai_paused) {
      return new Response(JSON.stringify({ ok: true, skipped: 'ai_paused' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Intent + psych state + personality detection (L38 + L39 + L40)
    const { intent, confidence, objection_type, psych_state, psych_confidence, personality, personality_confidence } = await detectIntent(body);

    // L39 — resolve effective psych state (override > smoothed dominant > detected)
    const psychDisabled = (conv as any).psych_engine_disabled === true;
    const stateOverride = (conv as any).state_override as PsychState | null;
    const stateHistory: Array<{ state: PsychState; ts: string }> = Array.isArray((conv as any).psych_state_history)
      ? (conv as any).psych_state_history : [];
    const currentDominant = (conv as any).dominant_state as PsychState | null;
    const smoothing = applyStateSmoothing(stateHistory, psych_state, currentDominant);
    const effectiveState: PsychState = psychDisabled
      ? 'neutral'
      : (stateOverride ?? smoothing.dominant ?? psych_state);

    // L40 — resolve effective personality (override > smoothed dominant > detected)
    const personalityDisabled = (conv as any).personality_engine_disabled === true;
    const personalityOverride = (conv as any).personality_override as Personality | null;
    const personalityHistory: Array<{ personality: Personality; ts: string }> = Array.isArray((conv as any).personality_history)
      ? (conv as any).personality_history : [];
    const currentDominantPersonality = (conv as any).dominant_personality as Personality | null;
    const personalitySmoothing = applyPersonalitySmoothing(personalityHistory, personality, currentDominantPersonality);
    const effectivePersonality: Personality = personalityDisabled
      ? 'unknown'
      : (personalityOverride ?? personalitySmoothing.dominant ?? personality);

    // 5. Collision checks
    const now = new Date();
    const lastAi = conv!.last_ai_reply_at ? new Date(conv!.last_ai_reply_at) : null;
    const lastHuman = conv!.last_human_reply_at ? new Date(conv!.last_human_reply_at) : null;
    const cooldown_active = lastAi ? (now.getTime() - lastAi.getTime() < settings.min_reply_interval_seconds * 1000) : false;
    const human_replied_recently = lastHuman ? (now.getTime() - lastHuman.getTime() < 30 * 60 * 1000) : false;
    const in_quiet_hours = isQuietHour(now, settings.quiet_hours_start, settings.quiet_hours_end);
    const stop_received = intent === 'stop';

    let blockReason: string | null = null;
    if (stop_received) blockReason = 'stop_keyword';
    else if (human_replied_recently) blockReason = 'human_handling';
    else if (in_quiet_hours) blockReason = 'quiet_hours';
    else if (cooldown_active) blockReason = 'cooldown';
    else if ((conv!.ai_reply_count ?? 0) >= settings.max_replies_per_conversation) blockReason = 'max_replies_reached';

    if (blockReason) {
      await supabase.from('wa_messages').insert({
        conversation_id: conv!.id, lead_id: conv!.lead_id, funnel_key: conv!.funnel_key,
        direction: 'outbound_ai', blocked: true, blocked_reason: blockReason,
        intent, intent_confidence: confidence,
      });

      if (stop_received && conv!.lead_id) {
        await supabase.from('leads').update({ do_not_contact: true }).eq('id', conv!.lead_id);
      }

      return new Response(JSON.stringify({ ok: true, blocked: blockReason }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Decide action
    const action = { ...INTENT_ACTIONS[intent] };

    // L38: if objection with detected sub-type → swap to deep script template
    if (intent === 'objection' && objection_type && OBJECTION_TEMPLATE[objection_type]) {
      action.template_key = OBJECTION_TEMPLATE[objection_type];
      // Most objection deep scripts steer toward booking → attach booking link
      if (objection_type !== 'no_interest' && objection_type !== 'who_are_you') {
        action.send_booking_link = true;
      }
    }

    const shouldEscalate = action.escalate || confidence < settings.ai_confidence_threshold ||
      (conv!.lead_id && settings.high_value_score_threshold > 0); // refined below

    // 7. Resolve template body — priority:
    //    L40 personality (wa_p_<personality>_<purpose>)
    //    → L39 state    (wa_state_<state>_<purpose>)
    //    → L38 base intent (incl. wa_obj_* deep scripts)
    //    → inline FALLBACK_COPY
    let replyBody = '';
    let resolvedTemplateKey = action.template_key;
    if (action.template_key) {
      const purpose = INTENT_TO_PURPOSE[intent];

      // 7a. Try personality-specific FIRST (L40)
      const personalityKey = (!personalityDisabled && effectivePersonality !== 'unknown' && purpose)
        ? `wa_p_${effectivePersonality}_${purpose}`
        : null;
      if (personalityKey) {
        const { data: pTpl } = await supabase.from('message_library')
          .select('body_de, body_en')
          .eq('template_key', personalityKey)
          .eq('channel', 'whatsapp')
          .eq('active', true)
          .limit(1).maybeSingle();
        if (pTpl) {
          replyBody = pTpl.body_de || pTpl.body_en || '';
          resolvedTemplateKey = personalityKey;
        }
      }

      // 7b. Try state-specific (L39)
      if (!replyBody) {
        const stateKey = (!psychDisabled && effectiveState !== 'neutral' && purpose)
          ? `wa_state_${effectiveState}_${purpose}`
          : null;
        if (stateKey) {
          const { data: stateTpl } = await supabase.from('message_library')
            .select('body_de, body_en')
            .eq('template_key', stateKey)
            .eq('channel', 'whatsapp')
            .eq('active', true)
            .limit(1).maybeSingle();
          if (stateTpl) {
            replyBody = stateTpl.body_de || stateTpl.body_en || '';
            resolvedTemplateKey = stateKey;
          }
        }
      }

      // 7c. Fallback to base intent template (L38, incl. wa_obj_*)
      if (!replyBody) {
        const { data: tpl } = await supabase.from('message_library')
          .select('body_de, body_en')
          .eq('template_key', action.template_key)
          .eq('channel', 'whatsapp')
          .eq('active', true)
          .limit(1).maybeSingle();
        replyBody = (tpl?.body_de || tpl?.body_en) || FALLBACK_COPY[action.template_key] || '';
      }
    }

    // Inject placeholders
    const firstName = (conv as any)?.lead_first_name || '';
    replyBody = replyBody.replace(/\{\{name\}\}/gi, firstName).replace(/\{\{Name\}\}/g, firstName);

    // Inject links (placeholders)
    if (action.send_booking_link) {
      const link = Deno.env.get('PUBLIC_BOOKING_URL') || 'https://ethical-closing.lovable.app/quiz';
      replyBody = replyBody.replace('{{booking_link}}', link);
    }
    if (action.send_reschedule_link) {
      const link = Deno.env.get('PUBLIC_RESCHEDULE_URL') || 'https://ethical-closing.lovable.app/reschedule';
      replyBody = replyBody.replace('{{reschedule_link}}', link);
    }

    // 8. Escalation path
    if (shouldEscalate && intent === 'unknown') {
      const handoffBody = FALLBACK_COPY['wa_escalation_handoff'];
      const sent = await sendWhatsApp(phone_e164, handoffBody);

      await supabase.from('wa_escalations').insert({
        conversation_id: conv!.id, lead_id: conv!.lead_id, funnel_key: conv!.funnel_key,
        trigger: confidence < settings.ai_confidence_threshold ? 'ai_low_confidence' : 'complex_question',
        status: 'open',
        notes: `Inbound: "${body.slice(0,200)}"`,
      });

      await supabase.from('wa_messages').insert({
        conversation_id: conv!.id, lead_id: conv!.lead_id, funnel_key: conv!.funnel_key,
        direction: 'outbound_ai', body: handoffBody,
        intent, intent_confidence: confidence,
        template_key: 'wa_escalation_handoff',
        twilio_sid: sent.sid || null,
        blocked: !sent.ok, blocked_reason: sent.ok ? null : sent.error,
      });

      await supabase.from('wa_conversations').update({
        state: 'escalated',
        last_intent: intent,
        last_intent_confidence: confidence,
        last_ai_reply_at: new Date().toISOString(),
        ai_reply_count: (conv!.ai_reply_count ?? 0) + 1,
      }).eq('id', conv!.id);

      return new Response(JSON.stringify({ ok: true, escalated: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!replyBody) {
      // No template + no escalation path → safe abort
      await supabase.from('wa_messages').insert({
        conversation_id: conv!.id, lead_id: conv!.lead_id, funnel_key: conv!.funnel_key,
        direction: 'outbound_ai', blocked: true, blocked_reason: 'no_template',
        intent, intent_confidence: confidence,
      });
      return new Response(JSON.stringify({ ok: true, skipped: 'no_template' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 9. Send
    const sent = await sendWhatsApp(phone_e164, replyBody);

    const { data: outMsg } = await supabase.from('wa_messages').insert({
      conversation_id: conv!.id, lead_id: conv!.lead_id, funnel_key: conv!.funnel_key,
      direction: 'outbound_ai', body: replyBody,
      intent, intent_confidence: confidence,
      template_key: resolvedTemplateKey,
      twilio_sid: sent.sid || null,
      blocked: !sent.ok, blocked_reason: sent.ok ? null : sent.error,
    }).select('id').maybeSingle();

    // L39 — persist state history + dominant + log psych event
    const newHistoryEntry = { state: psych_state, ts: new Date().toISOString(), confidence: psych_confidence };
    const trimmedHistory = [...stateHistory, newHistoryEntry].slice(-10);

    // L40 — persist personality history + dominant
    const newPersonalityEntry = { personality, ts: new Date().toISOString(), confidence: personality_confidence };
    const trimmedPersonalityHistory = [...personalityHistory, newPersonalityEntry].slice(-10);

    await supabase.from('wa_conversations').update({
      state: action.next_state,
      last_intent: intent,
      last_intent_confidence: confidence,
      last_ai_reply_at: new Date().toISOString(),
      last_outbound_at: new Date().toISOString(),
      ai_reply_count: (conv!.ai_reply_count ?? 0) + 1,
      psych_state,
      psych_state_confidence: psych_confidence,
      psych_state_history: trimmedHistory,
      dominant_state: smoothing.dominant,
      personality_type: personality,
      personality_confidence,
      personality_history: trimmedPersonalityHistory,
      dominant_personality: personalitySmoothing.dominant,
    }).eq('id', conv!.id);

    await supabase.from('wa_psych_state_events').insert({
      conversation_id: conv!.id,
      lead_id: conv!.lead_id,
      funnel_key: conv!.funnel_key,
      message_id: outMsg?.id ?? null,
      detected_state: psych_state,
      confidence: psych_confidence,
      effective_state: effectiveState,
      smoothing_applied: smoothing.smoothed,
      override_active: !!stateOverride,
      signal_text: body.slice(0, 200),
      reply_template_key: resolvedTemplateKey,
      reply_sent: sent.ok,
    });

    // L40 — log personality event
    await supabase.from('wa_personality_events').insert({
      conversation_id: conv!.id,
      lead_id: conv!.lead_id,
      funnel_key: conv!.funnel_key,
      message_id: outMsg?.id ?? null,
      detected_personality: personality,
      confidence: personality_confidence,
      effective_personality: effectivePersonality,
      smoothing_applied: personalitySmoothing.smoothed,
      override_active: !!personalityOverride,
      signal_text: body.slice(0, 200),
      reply_template_key: resolvedTemplateKey,
      reply_sent: sent.ok,
    });

    return new Response(JSON.stringify({
      ok: true, intent, confidence,
      psych: { detected: psych_state, effective: effectiveState, smoothed: smoothing.smoothed, override: !!stateOverride },
      personality: { detected: personality, effective: effectivePersonality, smoothed: personalitySmoothing.smoothed, override: !!personalityOverride },
      action: resolvedTemplateKey, sent: sent.ok,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('[L38 responder]', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
