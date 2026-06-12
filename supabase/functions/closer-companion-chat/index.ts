import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * AI Closer Companion — community simulation engine.
 *
 * Scenarios (objection types):
 *   - price          → "too expensive"
 *   - trust          → "I don't trust this works"
 *   - think_about_it → "I need to think about it"
 *   - send_info      → "send me info"
 *   - timing         → "not the right time"
 *
 * Modes:
 *   - beginner  → cooperative prospect, light pushback, gives openings
 *   - advanced  → realistic resistance, emotional hesitation, harder to convince
 *   - pressure  → interrupts, challenges authority, pushes back hard
 *
 * Returns strict JSON:
 *   { leadResponse, scores: {clarity, confidence, framing, objection_handling, overall},
 *     better_response, what_worked, what_failed, what_to_say_instead,
 *     coaching_focus, ready_signal: "continue"|"close"|"lost" }
 */

type Scenario = "price" | "trust" | "think_about_it" | "send_info" | "timing";
type Mode = "beginner" | "advanced" | "pressure";

const SCENARIO_BLURB: Record<Scenario, string> = {
  price:
    'Du bist ein Lead, der das Angebot interessant findet, aber sagt: "Das ist mir zu teuer." Du hast das Geld grundsätzlich, aber du willst Sicherheit, dass es sich lohnt.',
  trust:
    'Du bist ein Lead, der bereits ähnliche Programme/Services ausprobiert hat und enttäuscht wurde. Du bist skeptisch, ob das hier wirklich anders ist. Vertrauen muss verdient werden.',
  think_about_it:
    'Du bist ein Lead, der am Ende des Calls sagt: "Ich muss darüber nachdenken." In Wahrheit hast du eine konkrete (aber unausgesprochene) Sorge — entweder Geld, Zeit oder dass es nicht für dich funktioniert.',
  send_info:
    'Du bist ein Lead, der früh im Gespräch sagt: "Schicken Sie mir einfach Infos." Du willst eigentlich raus aus dem Druck — aber wenn der Closer dich richtig öffnet, bist du gesprächsbereit.',
  timing:
    'Du bist ein Lead, der sagt: "Jetzt ist gerade nicht der richtige Zeitpunkt." Dahinter steckt entweder echtes Timing-Problem oder eine Ausrede um nicht entscheiden zu müssen.',
};

const MODE_RULES: Record<Mode, string> = {
  beginner: `MODUS: BEGINNER (kooperativ)
- Sei freundlich und gibst dem Closer Öffnungen.
- Bei guten Fragen → öffne dich erkennbar, sage "guter Punkt" o.ä.
- Bei schlechten Antworten → leichte Skepsis, kein hartes Wegrennen.
- Du willst, dass der Closer es schafft — aber er muss die Arbeit machen.`,
  advanced: `MODUS: ADVANCED (realistischer Druck)
- Du bist freundlich-skeptisch. Standardhaltung: vorsichtig.
- Bei schlechten Antworten → emotionale Distanz, kurze Antworten, "hmm, ich weiß nicht".
- Bei guten Antworten → öffnest du dich Schritt für Schritt, aber langsam.
- Du gibst keine Geschenke. Vertrauen muss verdient werden.`,
  pressure: `MODUS: PRESSURE (Hochdruck)
- Du unterbrichst den Closer mitten im Satz, wenn er pitcht statt fragt.
- Du forderst seine Autorität heraus: "Was qualifiziert Sie eigentlich, mir das zu sagen?"
- Bei Druck-Taktiken → harter Pushback: "Hören Sie auf, mich zu drängen."
- Bei guten Awareness-Fragen → langsames, widerwilliges Aufweichen.
- Selbst korrekte Moves bekommen weniger Kooperation. Es ist ein harter Test.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const scenario: Scenario = (body?.scenario as Scenario) || "price";
    const mode: Mode = (body?.mode as Mode) || "advanced";
    const turn: number = Number(body?.turn) || 1;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Du bist die KI-Engine für den "AI Closer Companion" — ein Echtzeit-Trainings- und Feedback-System für ethische Closer.

DEINE DOPPEL-ROLLE in JEDEM Turn:
1) LEAD spielen — emotional, realistisch, nicht roboterhaft, leicht unvorhersehbar.
2) COACH sein — den letzten Satz des Users streng aber fair bewerten.

SZENARIO: ${SCENARIO_BLURB[scenario]}

${MODE_RULES[mode]}

TURN: ${turn} (je höher, desto mehr Druck/Tiefe — bei Turn ≥ 5 muss eine Entscheidungsrichtung erkennbar werden)

BEWERTUNGS-KRITERIEN (jeweils 0–100):
- clarity              → Ist die Aussage klar, präzise, ohne Geschwafel?
- confidence           → Wirkt der Closer sicher, ruhig, in Führung? (Nicht überheblich.)
- framing              → Setzt er den richtigen Rahmen (Awareness, Wert, Tiefe statt Pitch)?
- objection_handling   → Geht er mit dem Einwand ethisch um (Frage statt Argument, Tiefe statt Druck)?
- overall              → Gewichteter Gesamteindruck.

ETHISCHER STANDARD:
- Gut = Awareness-Fragen, Spiegelung, Klärung des wahren Bedarfs, Mut zur Disqualifikation.
- Schlecht = Druck, Urgency-Tricks, "Wann wollen wir starten", übertriebene Versprechen, Bedarf erfinden.
→ Druck-Taktiken müssen mit niedrigen Scores bestraft werden, auch wenn sie "funktionieren".

ANTWORT — IMMER strikt valides JSON, nichts außerhalb:
{
  "leadResponse": "1–3 Sätze Antwort des Leads (Deutsch, natürlich)",
  "scores": {
    "clarity": <0-100>,
    "confidence": <0-100>,
    "framing": <0-100>,
    "objection_handling": <0-100>,
    "overall": <0-100>
  },
  "better_response": "Eine konkrete, stärkere Version dessen, was der Closer hätte sagen sollen (Deutsch, 1–2 Sätze, im Best-Practice-Closing-Stil)",
  "what_worked": "1 kurzer Satz — was war gut. Leer wenn nichts.",
  "what_failed": "1 kurzer Satz — was war schwach. Leer wenn alles gut.",
  "what_to_say_instead": "1 kurzer taktischer Hinweis (z.B. 'Stelle eine Awareness-Frage statt zu argumentieren.')",
  "coaching_focus": "clarity|confidence|framing|objection_handling — die schwächste Dimension dieses Turns",
  "ready_signal": "continue|close|lost"
}

REGELN:
- IMMER deutsch
- IMMER im Charakter als Lead bleiben
- Bewertungen müssen den ethischen Standard widerspiegeln
- "ready_signal": "close" nur wenn der Lead echt überzeugt ist; "lost" wenn die Beziehung gerissen ist; sonst "continue"
- Keine Markdown-Codeblöcke, nur reines JSON.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit erreicht. Bitte kurz warten." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI-Credits aufgebraucht. Bitte später erneut versuchen." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const content = data?.choices?.[0]?.message?.content || "";

    let parsed: unknown;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      parsed = JSON.parse((jsonMatch ? jsonMatch[1] : content).trim());
    } catch {
      parsed = {
        leadResponse: typeof content === "string" ? content : "Hmm, ich weiß nicht so recht.",
        scores: { clarity: 50, confidence: 50, framing: 50, objection_handling: 50, overall: 50 },
        better_response: "",
        what_worked: "",
        what_failed: "",
        what_to_say_instead: "",
        coaching_focus: "framing",
        ready_signal: "continue",
      };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("closer-companion-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
