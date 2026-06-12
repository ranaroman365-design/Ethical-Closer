import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIGNAL_LIBRARY = `
SIGNAL LIBRARY — Use these concrete patterns for state detection.
IMPORTANT: Match patterns from this library FIRST. Free interpretation is secondary.

═══════════════════════════════════
CLUSTER 1: SURFACE SIGNALS
═══════════════════════════════════
Patterns:
- Short, generic answers ("ja passt", "klingt gut", "alles bestens")
- Polite but distanced tone
- No emotional content in voice
- Answers feel rehearsed or socially performed
- Little personal detail shared
- "Laeuft ganz gut", "bin zufrieden eigentlich"
- Deflects with humor when depth is near
- Asks immediately about price/features without engagement
- "Ja klar", "sicher", "auf jeden Fall" (automatic agreement without depth)
- Answers shorter than 10 words consistently

→ Mapping: State=surface, Momentum=low, Risk=medium, Commitment=weak

═══════════════════════════════════
CLUSTER 2: EXPLORATION SIGNALS
═══════════════════════════════════
Patterns:
- Describes situation more openly and in detail
- Engages with questions, gives context
- "Eigentlich...", "naja, wenn ich ehrlich bin"
- Compares past attempts or experiences
- Mentions timeframes or history
- "Ich hab schon einiges probiert", "das Problem ist eher..."
- Moderate openness but still logical, not yet emotional
- Asks clarifying questions about approach
- Shares background without prompting
- Longer answers (20+ words)

→ Mapping: State=exploration, Momentum=medium, Risk=low-medium, Commitment=weak-emerging

═══════════════════════════════════
CLUSTER 3: EMOTIONAL DEPTH SIGNALS
═══════════════════════════════════
Patterns:
- Longer pauses before answering
- Speech slows down noticeably
- Personal ownership statements ("ich habe...", "ich merke gerade...")
- Self-reflection without prompting
- Mentions family, identity, fear, or personal values
- Honest uncertainty: "wenn ich ehrlich bin, dann..."
- "Das macht mir Angst", "ich will nicht mehr so weitermachen"
- Sighs or audible emotional processing
- Fewer filler words, more deliberate speech
- Silence after own statement (self-processing)
- Speaks about frustration, desire, or inner conflict
- Vulnerability without social performance
- Voice changes pitch or becomes quieter

→ Mapping: State=depth, Momentum=high, Risk=low, Commitment=emerging

═══════════════════════════════════
CLUSTER 4: RESISTANCE SIGNALS (CRITICAL — 30+ patterns)
═══════════════════════════════════

4a) Price resistance:
- "Zu teuer", "muss ich mir leisten koennen"
- "Was kostet das genau" (asked defensively, not curiously)
- "Gibt es Rabatt", "ist mir zu viel"
- "Kann ich mir nicht leisten"
- "Das ist eine Menge Geld"

4b) Delay tactics:
- "Muss nachdenken", "schlafe nochmal drueber"
- "Melde mich", "brauche Zeit", "nicht jetzt"
- "Vielleicht spaeter", "muss das sacken lassen"
- "Ist gerade nicht der richtige Zeitpunkt"
- "Ende des Monats/Quartals nochmal"

4c) Delegation / partner shield:
- "Muss mit Partner/Frau/Mann sprechen"
- "Muss Chef fragen", "entscheide nicht allein"
- "Muss das besprechen", "mein Mann/meine Frau hat auch ein Wort"

4d) Info-shield:
- "Schicken Sie mir Unterlagen"
- "Haben Sie eine Website", "wo kann ich nachlesen"
- "Gibt es Referenzen", "schicken Sie mir eine Email"
- "Ich schau mir das nochmal in Ruhe an"

4e) Vagueness / deflection:
- Answers beside the question asked
- Topic changes after deep moments
- "Ja mal schauen", "grundsaetzlich schon"
- "Klingt interessant" (without follow-up)
- "Muss ich mir anschauen"
- Humor as escape strategy after pressure point

4f) Logical distancing:
- Switches to rational mode after emotional moment
- "Rein objektiv betrachtet", "wenn man das nuechtern sieht"
- "Logisch gesehen...", "vom Kopf her..."
- Very rational answers to emotional questions

4g) Comparison shield:
- "Muss noch andere Angebote vergleichen"
- "Gibt es Alternativen", "was unterscheidet euch"
- "Ich hab da noch ein anderes Angebot"

4h) Identity protection:
- "Bin eigentlich nicht der Typ fuer sowas"
- "Mache sowas normalerweise nicht"
- "Bin da eher skeptisch", "ich bin Realist"

→ Mapping: State=resistance, Momentum=medium-low, Risk=medium-high, Commitment=weak

═══════════════════════════════════
CLUSTER 5: CONFUSION SIGNALS
═══════════════════════════════════
Patterns:
- Contradicts self ("einerseits... andererseits")
- Scattered, incoherent answers
- "Ich weiss nicht genau", "ich bin mir unsicher"
- Too many open loops in conversation
- Overwhelmed tone
- Asks same question twice
- "Das ist alles so viel", "ich blick nicht mehr durch"
- "Was genau meinen Sie damit" (repeated)
- Repeats earlier resolved concerns
- Answers become fuzzy or uncertain
- Decision path is visibly unclear
- Jumps between topics without resolution

→ Mapping: State=confusion, Momentum=low, Risk=medium, Commitment=weak

═══════════════════════════════════
CLUSTER 6: DECISION SIGNALS
═══════════════════════════════════
Patterns:
- "Was waere der naechste Schritt?"
- "Wie geht es dann weiter?", "wann koennte ich anfangen?"
- Compares options seriously and specifically
- Ownership language ("ich will", "ich entscheide mich", "das mache ich")
- Reflects on real consequences
- Reduced avoidance patterns
- Asks logistics/next-step questions
- Silence after important moments (processing)
- "Was brauchen Sie von mir?", "ab wann gilt das?"
- Future-oriented language increases
- Fewer escape patterns
- Stronger personal anchoring

→ Mapping: State=decision, Momentum=high, Risk=low, Commitment=emerging-strong

═══════════════════════════════════
CLUSTER 7: FRAGILE COMMITMENT SIGNALS (CRITICAL)
═══════════════════════════════════
Patterns:
- "Ja ok machen wir" but flat/fast without emotional shift
- Agrees after pressure without visible internal change
- Socially compliant "ja" without conviction markers
- No follow-up questions about next steps after agreeing
- "Klingt gut" without personal anchoring
- Energy drops after agreement
- "Ja warum nicht" (indifferent rather than committed)
- Agrees too quickly after long resistance phase
- Says yes but voice sounds uncertain or weak
- No reiteration of personal motivation
- Fast closure without depth exchange preceding it
- Avoids clarifying commitment details

→ Mapping: State=decision, Momentum=medium, Risk=HIGH, Commitment=WEAK
→ ALWAYS flag as fragile commitment warning

═══════════════════════════════════
PRIORITY RULES (CRITICAL)
═══════════════════════════════════
When multiple signal clusters are present simultaneously:
1. Resistance + Depth → PRIORITIZE Resistance (prospect pulled back)
2. Decision + Fragile signals → PRIORITIZE Risk (commitment not real)
3. Exploration + Confusion → PRIORITIZE Confusion (prospect lost)
4. Multiple clusters → Choose the DOMINANT pattern (most signals matching)
5. Never output multiple competing interpretations — pick ONE primary state

═══════════════════════════════════
SIGNAL WEIGHTING
═══════════════════════════════════
- Count how many patterns from each cluster match the current transcript
- The cluster with the most matches = primary state
- If 3+ patterns from one cluster match → confidence = high
- If 1-2 patterns match → confidence = medium  
- If no clear match → confidence = low, use "Wahrscheinlich/Most likely" language

═══════════════════════════════════
MOMENTUM SCORING
═══════════════════════════════════
High: increasing honesty, deeper answers, fewer avoidance patterns, ownership grows, consequence awareness, emotionally congruent engagement
Medium: mixed openness+resistance, some clarity but instable, progress inconsistent, alternating depth and surface
Low: repeated avoidance, shallow politeness, defensive energy, stuck in objections, no deepening, conversation circling

═══════════════════════════════════
COMMITMENT QUALITY
═══════════════════════════════════
Strong: congruent words + tone, clear ownership, low avoidance, emotionally integrated decision
Emerging: moving toward real ownership, still some uncertainty, but decision forming genuinely
Weak: socially compliant answers, unclear yes, unresolved tension, likely regret or future ghosting

═══════════════════════════════════
RISK LEVEL
═══════════════════════════════════
High: repeated unresolved resistance, agreement without emotional congruence, pressure not integrated, partner objection as deflection, price left unresolved
Medium: mixed signals, some resolved some open, progress but instability
Low: genuine engagement, congruent responses, resolved concerns

═══════════════════════════════════
STATE SHIFT RULES — flag in stateShiftAlert:
═══════════════════════════════════
Surface->Exploration: prospect starts giving real context
Exploration->Depth: emotional content appears, voice changes
Depth->Resistance: prospect pulls back after vulnerable moment
Resistance->Confusion: multiple unresolved objections compound
Resistance->Decision: objection dissolves into clarity
Decision->FragileCommitment: "yes" without congruence

═══════════════════════════════════
TACTICAL MAPPING (shapes objective + nextMove):
═══════════════════════════════════
Surface -> objective: deepen; avoid: pitching/presenting too early
Exploration -> objective: clarify and expand; avoid: rushing to solution
Depth -> objective: hold and reflect; avoid: fixing or rescuing
Resistance -> objective: diagnose before answering; avoid: defending or persuading
Confusion -> objective: simplify and restore orientation; avoid: adding more information
Decision -> objective: hold space and receive; avoid: pushing, over-selling, talking too much

═══════════════════════════════════
SILENCE INTELLIGENCE — set holdSilence=true when:
═══════════════════════════════════
- After price reveal and prospect goes quiet
- After prospect says something deeply personal
- After an important question where prospect needs processing time
- When closer is likely to overtalk a meaningful moment
- After prospect's "yes" that needs space to become real
- After emotional depth moment — do NOT rescue
- After prospect sighs or pauses mid-sentence`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { transcript, previousStates, language } = await req.json();
    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'transcript'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lang = language === "en" ? "en" : "de";
    const prevContext = previousStates?.length
      ? `\nPrevious detected states in this call: ${previousStates.join(" -> ")}`
      : "";

    const systemPrompt = lang === "de"
      ? `Du bist ein stiller taktischer Assistent fuer Live-Verkaufsgespraeche. Du analysierst Gespraechstranskripte und erkennst den aktuellen Gespraechszustand anhand konkreter Sprachmuster aus der Signal Library.

REGELN:
- Antworte IMMER ueber die tool_call Funktion
- Sei EHRLICH ueber Unsicherheit. Nutze "Wahrscheinlich" oder "Koennte sein" wenn unklar
- Gib KEINE Theorie. Nur operative Anweisungen
- Maximal 15 Woerter pro Feld
- Nutze die Signal Library als PRIMAERE Erkennungsgrundlage — nicht freie Interpretation
- confidence "high" NUR wenn 3+ Signale aus der Library in dieselbe Richtung zeigen
- Erkenne fragile Commitments: "Ja" ohne emotionale Kongruenz = commitmentQuality weak + riskLevel high
- Bei State Shifts: stateShiftAlert mit konkreter Transition ausfuellen (z.B. "Exploration -> Depth")
- momentumDrivers: 2-4 kurze, konkrete Beobachtungen aus dem Transkript
${prevContext}

${SIGNAL_LIBRARY}

Wenn Stille das Richtige ist, setze holdSilence auf true und gib silenceReason an.`
      : `You are a silent tactical assistant for live sales conversations. You analyze conversation transcripts and detect the current conversation state using concrete speech patterns from the Signal Library.

RULES:
- ALWAYS respond via the tool_call function
- Be HONEST about uncertainty. Use "Most likely" or "Could be" when unclear
- Give NO theory. Only operational instructions
- Maximum 15 words per field
- Use the Signal Library as PRIMARY detection foundation — not free interpretation
- confidence "high" ONLY when 3+ signals from library match in same direction
- Detect fragile commitments: "Yes" without emotional congruence = commitmentQuality weak + riskLevel high
- On state shifts: fill stateShiftAlert with concrete transition (e.g. "Exploration -> Depth")
- momentumDrivers: 2-4 short, concrete observations from the transcript
${prevContext}

${SIGNAL_LIBRARY}

If silence is the right move, set holdSilence to true and provide silenceReason.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Live transcript segment:\n"${transcript}"` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "live_analysis",
              description: "Return real-time tactical analysis of a live sales conversation based on signal pattern matching",
              parameters: {
                type: "object",
                properties: {
                  state: { type: "string", enum: ["surface", "exploration", "depth", "resistance", "confusion", "decision"] },
                  confidence: { type: "string", enum: ["low", "medium", "high"] },
                  matchedSignals: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-4 specific signals from the Signal Library that were detected in the transcript"
                  },
                  whatIsHappening: { type: "string", description: "Short explanation of current moment (max 20 words)" },
                  likelyIssue: { type: "string", enum: ["value_gap", "self_doubt", "trust_gap", "real_constraint", "overwhelm", "avoidance", "fragile_commitment", "emotional_processing"] },
                  objective: { type: "string", description: "Immediate goal based on tactical mapping (max 10 words)" },
                  nextMove: { type: "string", description: "Best next action (max 15 words)" },
                  suggestedSay: { type: "string", description: "One natural sentence the closer can use" },
                  avoidDoing: { type: "string", description: "Most likely reflex mistake to avoid (max 15 words)" },
                  holdSilence: { type: "boolean", description: "Whether the closer should hold silence now" },
                  silenceReason: { type: "string", description: "Why silence is needed (if holdSilence is true)" },
                  momentum: { type: "string", enum: ["low", "medium", "high"] },
                  commitmentQuality: { type: "string", enum: ["weak", "emerging", "strong"] },
                  riskLevel: { type: "string", enum: ["low", "medium", "high"] },
                  momentumDrivers: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-4 short concrete momentum observations from transcript"
                  },
                  stateShiftAlert: { type: "string", description: "Concrete state transition if detected (e.g. 'Exploration -> Depth'), empty if no shift" },
                },
                required: ["state", "confidence", "matchedSignals", "whatIsHappening", "likelyIssue", "objective", "nextMove", "suggestedSay", "avoidDoing", "holdSilence", "momentum", "commitmentQuality", "riskLevel"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "live_analysis" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      const content = data.choices?.[0]?.message?.content || "{}";
      return new Response(content, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(toolCall.function.arguments, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("live-copilot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
