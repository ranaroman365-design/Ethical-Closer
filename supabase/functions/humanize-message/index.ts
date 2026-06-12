/**
 * Layer 48.2 — Humanize Message (Lovable AI) · Multi-Channel
 *
 * Takes lead context (quiz, score, behavior, funnel stage, tone hint) and returns
 * ONE contextual message built on the canonical 4-part structure:
 *   1. ANCHOR     — reference something specific
 *   2. MIRRORING  — show understanding
 *   3. ORIENTATION — explain what's happening
 *   4. ACTION     — ONE clear next step
 *
 * Channels (Layer 48.10):
 *   - whatsapp → conversational, ≤ 60 words, line breaks allowed
 *   - sms      → ultra short, ≤ 30 words, single block, no links unless required
 *   - email    → documentation tone, ≤ 120 words, includes subject + greeting + sign-off
 *
 * The 4-part RELATIONSHIP TONE is identical across channels — only the assembled
 * `body` (and `subject` for email) adapts.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Channel = "whatsapp" | "sms" | "email";

interface Behavior {
  clicked_link?: boolean;
  ignored_messages?: number;
  delayed_response_minutes?: number;
  no_show_count?: number;
}

interface HumanizeInput {
  event_key: string;
  channel?: Channel;
  lang?: "de" | "en";
  name?: string;
  quiz_answers?: Record<string, string | number | boolean>;
  income_goal?: string | null;
  lead_score?: number | null;
  funnel_stage?: string | null;
  behavior?: Behavior;
  tone_hint?: "high_performer" | "uncertain" | "slow_responder" | "neutral";
  booking_link?: string;
  reschedule_link?: string;
  call_link?: string;
}

const CHANNEL_RULES: Record<
  Channel,
  { wordLimit: number; hardWordCap: number; description: string; needsSubject: boolean }
> = {
  whatsapp: {
    wordLimit: 60,
    hardWordCap: 70,
    description:
      "Conversational, short. Line breaks allowed. No greeting/sign-off. Feels like a person typing on the phone.",
    needsSubject: false,
  },
  sms: {
    wordLimit: 30,
    hardWordCap: 35,
    description:
      "Ultra short, single block, NO line breaks, NO emoji, NO greeting/sign-off. Treat each word as expensive. Include a link only if it is the action itself.",
    needsSubject: false,
  },
  email: {
    wordLimit: 120,
    hardWordCap: 140,
    description:
      "Documentation tone. Include short greeting (e.g. 'Hi {name},'), the 4 parts as flowing prose (paragraphs allowed), and a one-line sign-off ('— Ethical Closing'). The 4-part structure must remain present and in order. Provide a calm, factual subject line (≤ 8 words, no clickbait, no emoji).",
    needsSubject: true,
  },
};

const SYSTEM_PROMPT = `You write outbound messages on behalf of a human operator at a high-end sales academy ("Ethical Closing").

ABSOLUTE RULES (no exceptions):
1. The message must NOT feel templated. It must feel contextual and aware.
2. Use the 4-part RELATIONSHIP STRUCTURE in this exact order: ANCHOR → MIRRORING → ORIENTATION → ACTION.
   The 4 parts are returned as separate fields AND must be present (in order) inside the assembled body, regardless of channel.
3. Adapt FORMAT to the requested channel — but never weaken the relationship tone:
   - whatsapp: conversational, ≤ 60 words, no greeting/sign-off
   - sms: ultra short, ≤ 30 words, single block, no greeting/sign-off
   - email: documentation tone, ≤ 120 words, includes a short greeting and one-line sign-off, and a calm subject line
4. Selection-over-Pressure: never push, never sell, never guilt. Calm + certain + non-needy.
5. Address the person by first name if known. Use "du" in DE, "you" in EN.
6. Never invent facts. Only reference what the input actually contains.
7. Allowed links are passed in the input — never invent URLs.

FORBIDDEN (all channels):
- Emoji stacking (max 0 unless event_key starts with "internal.")
- Marketing tone, hype, urgency manipulation ("hurry", "limited spots", "don't miss")
- Multiple questions, multiple CTAs
- Words: "guaranteed", "passive income", "overnight", "exclusive opportunity"
- Hedging: "maybe", "kind of", "basically", "I think"
- For SMS: NO line breaks, NO emoji at all, NO greeting/sign-off
- For email: NO clickbait subjects, NO ALL CAPS, NO "Re:" / "Fwd:" tricks, NO emoji in subject

TONE BY HINT (relationship tone — same across channels):
- high_performer → direct, peer-to-peer, no softening
- uncertain → softer entry, more space, still one clear next step
- slow_responder → cut everything to the bone (especially on SMS)
- neutral → calm baseline

Return only the rendered fields via the tool call. Do not return free-form prose.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const input = (await req.json()) as HumanizeInput;
    if (!input?.event_key) {
      return new Response(JSON.stringify({ error: "event_key is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const lang = input.lang === "en" ? "en" : "de";
    const channel: Channel =
      input.channel === "sms" || input.channel === "email" ? input.channel : "whatsapp";
    const rules = CHANNEL_RULES[channel];

    const userPayload = {
      event_key: input.event_key,
      channel,
      channel_format: rules.description,
      word_target: rules.wordLimit,
      lang,
      lead: {
        name: input.name ?? null,
        income_goal: input.income_goal ?? null,
        lead_score: input.lead_score ?? null,
        funnel_stage: input.funnel_stage ?? null,
        tone_hint: input.tone_hint ?? "neutral",
        quiz_answers: input.quiz_answers ?? {},
        behavior: input.behavior ?? {},
      },
      allowed_links: {
        booking_link: input.booking_link ?? null,
        reschedule_link: input.reschedule_link ?? null,
        call_link: input.call_link ?? null,
      },
      instructions: `Generate ONE ${channel} message in the requested language that follows the 4-part structure. Anchor must reference one specific datum from the lead snapshot when available. Adapt only FORMAT to the channel — relationship tone stays identical.`,
    };

    const tool = {
      type: "function",
      function: {
        name: "emit_message",
        description:
          "Return a humanized message split into the 4 canonical parts plus channel-adapted body (and subject for email).",
        parameters: {
          type: "object",
          properties: {
            anchor: { type: "string", description: "1 short sentence referencing a specific datum about the person." },
            mirroring: { type: "string", description: "1 short sentence showing understanding of where they are." },
            orientation: { type: "string", description: "1 short sentence explaining what happens next." },
            action: { type: "string", description: "1 short sentence with the single next step. Include a link from allowed_links if relevant; otherwise omit." },
            body: {
              type: "string",
              description: `The final ${channel} body assembled from the four parts. Must respect the channel format (${rules.description}). ≤ ${rules.wordLimit} words target, hard cap ${rules.hardWordCap}.`,
            },
            subject: {
              type: "string",
              description:
                channel === "email"
                  ? "Calm subject line, ≤ 8 words, no clickbait, no emoji. Required for email."
                  : "Empty string for whatsapp/sms.",
            },
            channel: { type: "string", enum: ["whatsapp", "sms", "email"] },
            tone_used: { type: "string", enum: ["high_performer", "uncertain", "slow_responder", "neutral"] },
            datum_referenced: { type: "string", description: "Which input datum was used as the anchor (e.g. 'income_goal', 'quiz_answers.experience', 'name'). Empty string if none was available." },
          },
          required: ["anchor", "mirroring", "orientation", "action", "body", "subject", "channel", "tone_used", "datum_referenced"],
          additionalProperties: false,
        },
      },
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "emit_message" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Lovable AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error", detail: errText.slice(0, 500) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    if (!argsRaw) {
      return new Response(JSON.stringify({ error: "Model returned no structured output", raw: aiData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(argsRaw);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse model output", raw: argsRaw }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-side guardrails — fail closed if the model violated hard rules.
    const body = String(parsed.body ?? "");
    const subject = String(parsed.subject ?? "");
    const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
    const subjectWordCount = subject.trim().split(/\s+/).filter(Boolean).length;
    const banned = /\b(guaranteed|passive income|overnight|hurry|limited spots|don'?t miss|garantiert|risikofrei|jetzt zuschlagen)\b/i;
    const emojiRe = /[\p{Extended_Pictographic}]/u;
    const violations: string[] = [];

    if (wordCount > rules.hardWordCap) violations.push(`word_count_exceeded:${wordCount}/${rules.hardWordCap}`);
    if (banned.test(body)) violations.push("banned_phrase_body");

    if (channel === "sms") {
      if (/\n/.test(body)) violations.push("sms_contains_linebreak");
      if (emojiRe.test(body)) violations.push("sms_contains_emoji");
    }

    if (channel === "email") {
      if (!subject || subject.trim().length === 0) violations.push("email_missing_subject");
      if (subjectWordCount > 8) violations.push(`email_subject_too_long:${subjectWordCount}`);
      if (emojiRe.test(subject)) violations.push("email_subject_contains_emoji");
      if (/[A-Z]{4,}/.test(subject)) violations.push("email_subject_all_caps");
      if (banned.test(subject)) violations.push("banned_phrase_subject");
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: parsed,
        meta: {
          word_count: wordCount,
          subject_word_count: subjectWordCount,
          word_limit: rules.wordLimit,
          hard_word_cap: rules.hardWordCap,
          channel,
          model: "google/gemini-3-flash-preview",
          event_key: input.event_key,
          lang,
          violations,
          generated_at: new Date().toISOString(),
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("humanize-message error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
