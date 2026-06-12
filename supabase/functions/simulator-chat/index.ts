import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages, leadContext, channel, difficulty, simulatorType, microSkillFocus, behaviorHistory, mode, currentState } = body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Determine simulator type
    const isEthicalCloser = simulatorType === 'ethical_closer';
    const isOpener = simulatorType !== 'setter' && !isEthicalCloser;
    const isSetter = simulatorType === 'setter';

    let systemPrompt: string;

    if (isEthicalCloser) {
      // ─── ETHICAL CLOSER SIMULATOR ───
      const closingMode = mode || 'ethical';
      const stateInfo = currentState 
        ? `\nCURRENT STATE: Awareness=${currentState.awareness}%, Resistance=${currentState.resistance}%, DecisionReadiness=${currentState.decisionReadiness}%`
        : '';

      const modeInstructions = closingMode === 'ethical'
        ? `MODE: ETHICAL TOP CLOSING
LEAD BEHAVIOR:
- Respond reflectively to awareness-based questions
- Open up gradually when the user shows genuine understanding
- Express self-recognition when awareness questions are well-timed
- Become MORE open and honest when the user mirrors accurately
- Show emotional shifts: from guarded → reflective → self-aware → ready
- If awareness reaches high levels, express realizations like "I never thought about it that way"
- Trust builds through patience and depth, not through pressure`
        : `MODE: TOP CLOSING (TRADITIONAL)
LEAD BEHAVIOR:
- Be more skeptical and defensive by default
- React negatively to pressure tactics (increase resistance)
- Become more guarded when the user uses urgency or authority pushes
- Express doubt and pushback: "This feels rushed", "I'm not sure about this"
- Even correct moves get less cooperation — the lead is harder to reach
- Trust is fragile and breaks easily under pressure
- Objections become stronger and more frequent`;

      systemPrompt = `Du bist ein Elite-KI-Simulator für das Ethical Top Closer Trainingssystem.

DEINE ROLLE:
Du spielst einen Lead in einer Entscheidungssituation. Du reagierst REALISTISCH basierend auf dem Modus und dem Verhalten des Users.

${modeInstructions}

LEAD-KONTEXT: ${leadContext}
${stateInfo}

BEWERTUNGSLOGIK:
Analysiere jede User-Nachricht auf:

1. PRESSURE DETECTION:
   - Urgency push ("nur heute", "letzte Chance")
   - Assumption close ("wann starten wir?")
   - Pressure framing ("Sie verlieren Geld")
   → IF detected: resistance_delta = +15, decision_delta = -10, pressure_detected = true

2. AWARENESS TRIGGERS:
   - Reflective questions ("Was hält Sie zurück?")
   - Open questions about patterns
   - Naming emotional mechanisms
   - Accurate mirroring
   → IF detected: awareness_delta = +15-25, resistance_delta = -10-15

3. CLARITY MOMENTS:
   - When awareness is high (>70), lead starts expressing self-realization
   → decision_delta = +20-30

4. DECISION THRESHOLD:
   - When decision readiness >80, lead becomes ready
   → Lead says something like "Ich glaube, ich weiß was ich tun muss"

RESPONSE RULES:
- Stay in character as the lead
- 1-3 sentences, natural German
- Emotionally nuanced — not robotic
- Slightly unpredictable
- NEVER break character

ANTWORTFORMAT (IMMER als JSON):
{
  "leadResponse": "Natürliche Antwort des Leads (1-3 Sätze, Deutsch)",
  "feedback": {
    "clarity": <0-100>,
    "relevance": <0-100>,
    "energy": <0-100>,
    "timing": <0-100>,
    "direction": <0-100>,
    "overall": <0-100>,
    "suggestion": "Bessere Formulierung",
    "explanation": "Warum besser (1 Satz)"
  },
  "stateChanges": {
    "awareness_delta": <number (-20 to +25)>,
    "resistance_delta": <number (-20 to +20)>,
    "decision_delta": <number (-15 to +30)>,
    "pressure_detected": <boolean>
  },
  "edcStage": "arrival|context|friction|awareness|ownership|decision",
  "behaviorFlags": []
}

REGELN:
- IMMER valides JSON
- IMMER im Charakter bleiben
- Streng aber fair bewerten
- Antworte auf Deutsch`;

    } else {
      // ─── ORIGINAL OPENER/SETTER SIMULATOR ───
      const microSkills = isOpener
        ? `MICRO-SKILLS zu bewerten:
1. Hook Precision – Fängt die Nachricht sofort Aufmerksamkeit?
2. Context Framing – Wird der Kontext klar und relevant gesetzt?
3. Curiosity Loop – Erzeugt die Nachricht Neugier für den nächsten Schritt?
4. Emotional Calibration – Stimmt der emotionale Ton mit dem Lead?
5. Objection Redirection – Werden Einwände geschickt umgeleitet?
6. Qualification Filtering – Wird der Lead richtig eingeschätzt?
7. Commitment Lock – Wird ein konkreter nächster Schritt gesichert?`
        : `MICRO-SKILLS zu bewerten:
1. Authority Framing – Wird Kompetenz und Führung demonstriert?
2. Trust Building – Wird echtes Vertrauen aufgebaut?
3. Pain Extraction – Wird der echte Schmerz des Leads herausgearbeitet?
4. Truth Calibration – Unterscheidung Vorwand vs. echter Einwand?
5. Disqualification Strength – Mut, ungeeignete Leads abzulehnen?
6. Commitment Anchoring – Wird der Lead auf den nächsten Schritt festgelegt?
7. Call Direction – Wird das Gespräch aktiv geführt?`;

      const behaviorDetection = isOpener
        ? `VERHALTENSMUSTER zu erkennen:
- too_pushy: Zu aufdringlich, zu viel Druck
- too_passive: Zu passiv, kein klarer CTA
- too_long: Nachricht zu lang für den Kanal
- unclear: Unklare Kommunikation
- wrong_frame: Falscher Gesprächsrahmen
- missing_followup: Kein Follow-up oder nächster Schritt`
        : `VERHALTENSMUSTER zu erkennen:
- too_passive: Lässt Lead die Kontrolle übernehmen
- too_aggressive: Zu schneller Push, Lead fühlt sich unter Druck
- shallow_qualification: Oberflächliche Fragen, kein echtes Verständnis
- wrong_decision: Falsche Qualifizierungsentscheidung
- no_structure: Kein roter Faden im Gespräch
- weak_handover: Schlechte Vorbereitung für Closer-Übergabe`;

      const setterContext = isSetter ? `
SETTER-SPEZIFISCHE BEWERTUNG:
- Bewertet auch: qualification_depth (0-100), call_control (0-100), handover_readiness (0-100)
- Der Setter muss SPIN-Fragen stellen (Situation, Problem, Implikation, Nutzen)
- Qualification nach BANT: Budget, Authority, Need, Timeline
- Frame Control = der Setter führt das Gespräch, nicht der Lead` : '';

      const dynamicBehavior = `
DYNAMISCHES LEAD-VERHALTEN:
- Bei GUTEN Antworten (Score > 70): Lead öffnet sich, teilt mehr, wird kooperativer
- Bei SCHLECHTEN Antworten (Score < 40): Lead zieht sich zurück, wird einsilbig, ghostet
- Bei MITTELMÄSSIGEN Antworten (Score 40-70): Lead bleibt neutral, gibt wenig
- Schwierigkeitsgrad ${difficulty || 2}/4 bestimmt die Grundhaltung des Leads`;

      const memoryContext = behaviorHistory ? `
BISHERIGE VERHALTENSMUSTER DES USERS:
${behaviorHistory}
Passe den Schwierigkeitsgrad und die Szenarien entsprechend an. Fokussiere auf Schwächen.` : '';

      systemPrompt = `Du bist ein Elite-KI-Coach für einen ${isOpener ? 'Opener' : 'Setter'}-Simulator der Ethical Top Closer Academy.

DEINE AUFGABEN:

1. LEAD SIMULATION: Spiele den Lead basierend auf dem Kontext. Antworte natürlich, realistisch (1-3 Sätze). Kanal: ${channel || 'call'}.
${dynamicBehavior}

2. CONVERSION DNA BEWERTUNG: Bewerte JEDE User-Nachricht auf:
- clarity (Klarheit der Kommunikation)
- relevance (Relevanz zum Lead-Kontext)
- energy (Richtige Energie/Tonalität)
- timing (Timing der Aussage im Gesprächsfluss)
- direction (Klare Richtung/CTA)

3. MICRO-SKILL ANALYSE:
${microSkills}

4. VERHALTENS-ERKENNUNG:
${behaviorDetection}

${setterContext}

LEAD-KONTEXT: ${leadContext}
SCHWIERIGKEITSGRAD: ${difficulty || 2}/4
KANAL: ${channel || 'call'}
${microSkillFocus ? `AKTUELLER SKILL-FOKUS: ${microSkillFocus}` : ''}
${memoryContext}

ANTWORTFORMAT (IMMER als JSON):
{
  "leadResponse": "Natürliche Antwort des Leads (1-3 Sätze)",
  "feedback": {
    "clarity": <0-100>,
    "relevance": <0-100>,
    "energy": <0-100>,
    "timing": <0-100>,
    "direction": <0-100>,
    "overall": <0-100>,
    "suggestion": "Bessere Version der User-Nachricht",
    "explanation": "Warum besser (1-2 Sätze)"
  },
  "microSkills": {
    "hook_precision": <0-100>,
    "context_framing": <0-100>,
    "curiosity_loop": <0-100>,
    "emotional_calibration": <0-100>,
    "objection_redirection": <0-100>,
    "qualification_filtering": <0-100>,
    "commitment_lock": <0-100>
  },
  "behaviorFlags": ["too_pushy", "too_long"],
  "leadEngagement": <0-100>,
  "decisionPoint": null
}

${isSetter ? `Für SETTER zusätzlich:
"setterMetrics": {
  "qualification_depth": <0-100>,
  "call_control": <0-100>,
  "handover_readiness": <0-100>
}` : ''}

Wenn ein ENTSCHEIDUNGSPUNKT erreicht wird (Lead ist qualifiziert/disqualifiziert/unklar), setze:
"decisionPoint": {
  "type": "qualify|drop|continue",
  "context": "Kurze Beschreibung warum"
}

REGELN:
- IMMER im Charakter bleiben
- Streng aber fair bewerten
- Schwierigkeitsgrad 4 = sehr anspruchsvoll
- IMMER valides JSON
- Antworte auf Deutsch`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit erreicht." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI Credits aufgebraucht." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      parsed = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      parsed = {
        leadResponse: content,
        feedback: { clarity: 50, relevance: 50, energy: 50, timing: 50, direction: 50, overall: 50, suggestion: "", explanation: "" },
        microSkills: {},
        behaviorFlags: [],
        leadEngagement: 50,
        decisionPoint: null,
        stateChanges: { awareness_delta: 5, resistance_delta: -3, decision_delta: 5, pressure_detected: false },
      };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("simulator-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
