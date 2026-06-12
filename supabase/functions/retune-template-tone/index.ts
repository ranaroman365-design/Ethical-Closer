// Layer 48.7 — Tone Retune (DE)
// Rewrites a DE WhatsApp template body toward calmer/premium phrasing while
// preserving every {{variable}} placeholder exactly. Returns proposal only;
// operator reviews + pastes into the library. Never auto-mutates the canon.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  template_key: string;
  source_de: string;
  required_variables: string[];
  optional_variables?: string[];
  tone?: "calm_premium" | "calm_premium_brief";
}

const BANNED = [
  "garantiert", "passives einkommen", "schnell reich", "über nacht",
  "exklusiv für dich", "limited time", "jetzt zuschlagen", "sichere dir",
  "mega", "krass", "wahnsinn", "100%", "risikofrei",
];

function extractPlaceholders(s: string): string[] {
  return Array.from(s.matchAll(/\{\{([a-z_][a-z0-9_]*)\}\}/gi)).map((m) => m[1]);
}

function placeholderSetEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}

function bannedHits(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED.filter((b) => lower.includes(b));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as ReqBody;
    if (!body?.template_key || !body?.source_de || !Array.isArray(body?.required_variables)) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sourcePlaceholders = extractPlaceholders(body.source_de);
    const allowed = new Set([
      ...body.required_variables,
      ...(body.optional_variables ?? []),
    ]);

    const toneInstruction = body.tone === "calm_premium_brief"
      ? "Maximal 35 Wörter. Sehr knapp."
      : "Maximal 60 Wörter.";

    const systemPrompt = [
      "Du bist Editor für eine Premium-B2C-Marke (Apple x Loro Piana Tonalität).",
      "Du verfeinerst eine bestehende deutsche WhatsApp-Nachricht.",
      "",
      "ZIEL:",
      "- Ruhiger, hochwertiger, präziser klingen.",
      "- 'Selection over Pressure' — keine Dringlichkeit, kein Druck, kein Hype.",
      "- Klar, kurz, freundlich. Du-Form. Keine Floskeln.",
      "",
      "ABSOLUTE REGELN (Verstoß = Ablehnung):",
      "1. JEDEN {{variable}}-Platzhalter EXAKT übernehmen — gleiche Schreibweise, gleiche Anzahl, keine neuen erfinden, keinen weglassen.",
      `2. Erlaubte Platzhalter: ${[...allowed].map((v) => `{{${v}}}`).join(", ") || "(keine)"}`,
      `3. ${toneInstruction}`,
      "4. Verbotene Phrasen: " + BANNED.join(", "),
      "5. Keine Emojis stapeln (max 1 pro Nachricht, lieber gar keins).",
      "6. Keine Markenbehauptungen, keine Versprechen.",
      "7. Antwort = NUR der überarbeitete Body, kein Kommentar, keine Anführungszeichen.",
    ].join("\n");

    const userPrompt = [
      `Template: ${body.template_key}`,
      `Pflicht-Variablen: ${body.required_variables.map((v) => `{{${v}}}`).join(", ") || "(keine)"}`,
      body.optional_variables?.length
        ? `Optionale Variablen: ${body.optional_variables.map((v) => `{{${v}}}`).join(", ")}`
        : "",
      "",
      "Original:",
      body.source_de,
    ].filter(Boolean).join("\n");

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      const status = aiRes.status === 429 || aiRes.status === 402 ? aiRes.status : 502;
      return new Response(JSON.stringify({ error: "AI call failed", detail: txt }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    let proposed: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
    // Strip accidental wrapping quotes / code fences
    proposed = proposed.replace(/^```[a-z]*\n?|\n?```$/g, "").trim();
    if (proposed.startsWith('"') && proposed.endsWith('"')) {
      proposed = proposed.slice(1, -1).trim();
    }

    // ---- Server-side guardrails ----
    const proposedPlaceholders = extractPlaceholders(proposed);
    const placeholdersOk = placeholderSetEqual(sourcePlaceholders, proposedPlaceholders);
    const wordCount = proposed.split(/\s+/).filter(Boolean).length;
    const wordLimit = body.tone === "calm_premium_brief" ? 35 : 60;
    const banned = bannedHits(proposed);

    const violations: string[] = [];
    if (!placeholdersOk) {
      violations.push(
        `Platzhalter-Set verändert. Original: [${sourcePlaceholders.join(", ")}] → Vorschlag: [${proposedPlaceholders.join(", ")}]`,
      );
    }
    if (wordCount > wordLimit) {
      violations.push(`Zu lang: ${wordCount} Wörter (max ${wordLimit}).`);
    }
    if (banned.length > 0) {
      violations.push(`Verbotene Phrasen: ${banned.join(", ")}`);
    }

    return new Response(
      JSON.stringify({
        template_key: body.template_key,
        original: body.source_de,
        proposed,
        accepted: violations.length === 0,
        violations,
        meta: {
          source_placeholders: sourcePlaceholders,
          proposed_placeholders: proposedPlaceholders,
          word_count: wordCount,
          word_limit: wordLimit,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
