/**
 * Meeting Link Tracking — URL wrapper + validation utility
 *
 * Generates tracked meeting URLs that route through the
 * track-meeting-click edge function for click analytics.
 * Includes Safari-safe validation for pre-send dry-run.
 *
 * Canon: Layer 47 · Conversion · Visualization
 */

// ─── URL Validation ──────────────────────────────────────────────────────────

export interface MeetingLinkValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    rawUrl: string | null;
    trackedUrl: string | null;
    protocol: string | null;
    hostname: string | null;
    isSafariCompatible: boolean;
    hasTrackingToken: boolean;
    tokenDecodable: boolean;
  };
}

/**
 * Validates a meeting URL before sending.
 * Checks: well-formed URL, HTTPS, Safari-safe (no exotic schemes),
 * tracked URL decodability, redirect chain integrity.
 */
export function validateMeetingLink(
  rawUrl: string | null | undefined,
  trackedUrl?: string | null,
): MeetingLinkValidation {
  const result: MeetingLinkValidation = {
    valid: true,
    errors: [],
    warnings: [],
    details: {
      rawUrl: rawUrl || null,
      trackedUrl: trackedUrl || null,
      protocol: null,
      hostname: null,
      isSafariCompatible: true,
      hasTrackingToken: false,
      tokenDecodable: false,
    },
  };

  // 1. Check raw URL exists
  if (!rawUrl || !rawUrl.trim()) {
    result.valid = false;
    result.errors.push('Kein Meeting-Link vorhanden');
    return result;
  }

  // 2. Parse URL
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    result.valid = false;
    result.errors.push(`Ungültige URL: "${rawUrl.slice(0, 80)}"`);
    return result;
  }

  result.details.protocol = parsed.protocol;
  result.details.hostname = parsed.hostname;

  // 3. Protocol check — Safari blocks non-https in some contexts
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    result.valid = false;
    result.errors.push(`Ungültiges Protokoll: ${parsed.protocol} — nur https:// erlaubt`);
    result.details.isSafariCompatible = false;
  } else if (parsed.protocol === 'http:') {
    result.warnings.push('HTTP statt HTTPS — Safari kann blockieren');
    result.details.isSafariCompatible = false;
  }

  // 4. Hostname sanity
  if (!parsed.hostname || parsed.hostname === 'localhost') {
    result.warnings.push(`Hostname "${parsed.hostname}" — funktioniert nicht auf Mobilgeräten`);
    result.details.isSafariCompatible = false;
  }

  // 5. Safari-specific: URLs with special chars in path can break
  if (/[<>{}|\\^`]/.test(rawUrl)) {
    result.warnings.push('URL enthält Sonderzeichen die Safari-Probleme verursachen können');
    result.details.isSafariCompatible = false;
  }

  // 6. Check max length (some SMS gateways truncate >160 char URLs)
  if (rawUrl.length > 500) {
    result.warnings.push(`URL ist ${rawUrl.length} Zeichen lang — könnte in SMS abgeschnitten werden`);
  }

  // 7. Validate tracked URL if provided
  if (trackedUrl) {
    result.details.hasTrackingToken = true;
    try {
      const trackedParsed = new URL(trackedUrl);
      const token = trackedParsed.searchParams.get('t');
      if (token) {
        try {
          const decoded = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(decoded);
          result.details.tokenDecodable = true;
          if (payload.u !== rawUrl) {
            result.warnings.push('Tracking-Token Ziel-URL stimmt nicht mit Raw-URL überein');
          }
        } catch {
          result.warnings.push('Tracking-Token nicht decodierbar');
        }
      } else {
        result.warnings.push('Tracked URL hat kein Token-Parameter');
      }
    } catch {
      result.warnings.push('Tracked URL ist ungültig');
    }
  }

  return result;
}

// ─── Safari Compatibility Checks ─────────────────────────────────────────────

export interface SafariCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface SimulationResult extends MeetingLinkValidation {
  safariChecks: SafariCheck[];
  trackingChain: {
    intact: boolean;
    steps: Array<{ step: string; ok: boolean; detail: string }>;
  };
  overallPass: boolean;
}

/**
 * "Link öffnen"-Simulation — NO real browser redirect.
 * Performs offline Safari-compatibility checks and tracking-chain integrity
 * verification. Returns a detailed breakdown suitable for UI display.
 */
export function simulateMeetingLinkOpen(params: {
  meetingUrl: string | null;
  appointmentId?: string | null;
  leadId?: string | null;
  channel?: 'email' | 'sms' | 'whatsapp' | 'manual';
}): SimulationResult {
  const { meetingUrl, appointmentId, leadId, channel = 'manual' } = params;

  const trackedUrl = meetingUrl
    ? createTrackedMeetingUrl({ meetingUrl, appointmentId, leadId, channel })
    : null;

  const validation = validateMeetingLink(meetingUrl, trackedUrl);

  // ── Safari Compatibility ───────────────────────────────────────────────
  const safariChecks: SafariCheck[] = [];

  // 1. HTTPS required
  const isHttps = !!meetingUrl && meetingUrl.startsWith('https://');
  safariChecks.push({
    label: 'HTTPS-Protokoll',
    passed: isHttps,
    detail: isHttps
      ? 'URL nutzt HTTPS — Safari-kompatibel'
      : 'Safari blockiert ggf. HTTP-Links oder exotische Protokolle',
  });

  // 2. No exotic characters (Safari encodes differently)
  const hasExoticChars = !!meetingUrl && /[<>{}|\\^`\u200B-\u200D\uFEFF]/.test(meetingUrl);
  safariChecks.push({
    label: 'Zeichensatz',
    passed: !hasExoticChars,
    detail: hasExoticChars
      ? 'URL enthält Sonderzeichen die in Safari Mobile URL-Parsing brechen können'
      : 'Keine problematischen Sonderzeichen',
  });

  // 3. URL length (Safari Mobile truncates ~2048 chars, SMS ~160 body)
  const urlLen = meetingUrl?.length ?? 0;
  const trackedLen = trackedUrl?.length ?? 0;
  const maxSafe = 2048;
  safariChecks.push({
    label: 'URL-Länge',
    passed: trackedLen <= maxSafe && urlLen <= maxSafe,
    detail: trackedLen > maxSafe
      ? `Tracked URL ${trackedLen} Zeichen — Safari kann ab ${maxSafe} abschneiden`
      : urlLen > 500
        ? `Raw URL ${urlLen} Zeichen — funktioniert, aber SMS-Gateways könnten kürzen`
        : `${urlLen} / ${trackedLen} Zeichen — OK`,
  });

  // 4. No data: / blob: / javascript: schemes
  let schemeOk = true;
  if (meetingUrl) {
    try {
      const parsed = new URL(meetingUrl);
      if (['data:', 'blob:', 'javascript:', 'file:'].includes(parsed.protocol)) {
        schemeOk = false;
      }
    } catch { schemeOk = false; }
  } else { schemeOk = false; }
  safariChecks.push({
    label: 'Sicheres Schema',
    passed: schemeOk,
    detail: schemeOk
      ? 'URL nutzt ein web-kompatibles Schema'
      : 'URL nutzt ein Schema das Safari blockiert (data:/blob:/javascript:/file:)',
  });

  // 5. No fragment-only (Safari ITP may strip in redirect)
  const isFragmentOnly = !!meetingUrl && /^https?:\/\/[^?#]+#/.test(meetingUrl) && !meetingUrl.includes('?');
  safariChecks.push({
    label: 'Fragment-Handling',
    passed: !isFragmentOnly || true, // warning only
    detail: isFragmentOnly
      ? 'URL hat nur Fragment (#) — Safari ITP kann Fragments bei Redirects entfernen'
      : 'Kein Fragment-Problem',
  });

  // ── Tracking Chain Integrity ───────────────────────────────────────────
  const chainSteps: Array<{ step: string; ok: boolean; detail: string }> = [];

  // Step 1: Raw URL parseable
  let rawOk = false;
  if (meetingUrl) {
    try { new URL(meetingUrl); rawOk = true; } catch { /* */ }
  }
  chainSteps.push({ step: 'Raw URL parsebar', ok: rawOk, detail: rawOk ? meetingUrl! : 'Ungültige oder fehlende URL' });

  // Step 2: Tracked URL generated
  const trackedGenerated = !!trackedUrl && trackedUrl.includes('track-meeting-click');
  chainSteps.push({ step: 'Tracked URL generiert', ok: trackedGenerated, detail: trackedGenerated ? trackedUrl! : 'Keine Tracked URL' });

  // Step 3: Token decodable
  let tokenOk = false;
  let decodedPayload: any = null;
  if (trackedUrl) {
    try {
      const tUrl = new URL(trackedUrl);
      const token = tUrl.searchParams.get('t');
      if (token) {
        const decoded = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
        decodedPayload = JSON.parse(decoded);
        tokenOk = true;
      }
    } catch { /* */ }
  }
  chainSteps.push({ step: 'Token decodierbar', ok: tokenOk, detail: tokenOk ? 'Base64url-Token valid' : 'Token fehlt oder defekt' });

  // Step 4: Payload matches raw URL
  const payloadMatch = tokenOk && decodedPayload?.u === meetingUrl;
  chainSteps.push({ step: 'Payload ↔ Raw URL', ok: payloadMatch, detail: payloadMatch ? 'Ziel-URL im Token stimmt überein' : 'Token-Ziel stimmt nicht mit Raw URL überein' });

  // Step 5: Channel in payload
  const channelOk = tokenOk && ['email', 'sms', 'whatsapp', 'manual'].includes(decodedPayload?.c);
  chainSteps.push({ step: 'Channel im Payload', ok: channelOk, detail: channelOk ? `Channel: ${decodedPayload.c}` : 'Channel fehlt oder ungültig' });

  // Step 6: IDs present
  const idsOk = tokenOk && (!!decodedPayload?.a || !!decodedPayload?.l);
  chainSteps.push({ step: 'Appointment/Lead-ID', ok: idsOk, detail: idsOk ? `appt=${decodedPayload.a || '—'}, lead=${decodedPayload.l || '—'}` : 'Keine IDs im Token — Tracking unvollständig' });

  const chainIntact = chainSteps.every(s => s.ok);
  const safariPass = safariChecks.every(s => s.passed);

  return {
    ...validation,
    safariChecks,
    trackingChain: { intact: chainIntact, steps: chainSteps },
    overallPass: validation.valid && safariPass && chainIntact,
  };
}

/**
 * @deprecated Use simulateMeetingLinkOpen() instead. Kept for backward compat.
 * Wraps simulateMeetingLinkOpen into the old async interface.
 */
export async function dryRunMeetingLink(params: {
  meetingUrl: string | null;
  appointmentId?: string | null;
  leadId?: string | null;
  channel?: 'email' | 'sms' | 'whatsapp' | 'manual';
}): Promise<MeetingLinkValidation & { reachable: boolean | null; reachabilityNote: string }> {
  const sim = simulateMeetingLinkOpen(params);
  return {
    ...sim,
    reachable: sim.overallPass ? true : null,
    reachabilityNote: sim.overallPass
      ? 'Simulation bestanden (Safari-kompatibel, Tracking-Kette intakt)'
      : `Simulation fehlgeschlagen: ${[
          ...sim.safariChecks.filter(c => !c.passed).map(c => c.label),
          ...sim.trackingChain.steps.filter(s => !s.ok).map(s => s.step),
        ].join(', ')}`,
  };
}

// ─── Tracked URL Generation ──────────────────────────────────────────────────

/**
 * Wraps a meeting URL with click tracking.
 * Returns a URL that goes through the tracking edge function,
 * which logs the click and redirects to the actual meeting.
 */
export function createTrackedMeetingUrl(params: {
  meetingUrl: string;
  appointmentId?: string | null;
  leadId?: string | null;
  channel: 'email' | 'sms' | 'whatsapp' | 'manual';
}): string {
  const { meetingUrl, appointmentId, leadId, channel } = params;
  if (!meetingUrl) return meetingUrl;

  const payload = {
    a: appointmentId || '',
    l: leadId || '',
    c: channel,
    u: meetingUrl,
  };

  // Base64url encode
  const token = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  return `https://${projectId}.supabase.co/functions/v1/track-meeting-click?t=${token}`;
}
