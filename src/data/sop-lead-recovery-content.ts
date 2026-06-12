import type { DocumentData } from '@/components/playbooks/DocumentReader';

export const sopLeadRecoveryV5: DocumentData = {
  id: 'sop-lead-recovery-v5',
  title: 'Lead Recovery & Conversion Protocol™',
  version: 'SOP v5 · State Machine Update',
  subtitle: 'Standard Operating Procedure — Alle eingehenden Leads',
  sections: [
    {
      id: 'overview',
      title: 'Grundprinzipien',
      subtitle: 'Geltungsbereich & Core Rules',
      content: `
<p><strong>Geltungsbereich:</strong> Alle Leads aus Ads, Quiz, Landingpages und organischen Kanälen.<br/>
<strong>Ausführende Rolle:</strong> Setter, Closer, Oleg oder designierter Operator.</p>

<table>
  <tr><th>SLA</th><td>Jeder Lead wird innerhalb von max. 24h kontaktiert</td></tr>
  <tr><th>Priorität</th><td>WhatsApp → Call → E-Mail</td></tr>
  <tr><th>Ziel</th><td>Jede Interaktion zielt auf Terminbuchung</td></tr>
  <tr><th>Pflicht</th><td>Kein Lead bleibt unbearbeitet</td></tr>
  <tr><th>Exit</th><td>Jeder Lead endet in BOOKED oder EXIT — keine offenen Enden</td></tr>
</table>
      `,
    },
    {
      id: 'lead-states',
      title: 'Lead-Zustände — Erweitertes Status-Modell',
      subtitle: '13 Zustände über drei Schichten',
      content: `
<p>Jeder Lead ist zu jedem Zeitpunkt <strong>einem Status zugewiesen</strong>. 13 Zustände über drei Schichten: <strong>Standard, Pre-Call, Recovery.</strong></p>

<h3>Standard-Flow</h3>
<table>
  <thead><tr><th>Status</th><th>Beschreibung</th></tr></thead>
  <tbody>
    <tr><td><strong>NEW_LEAD</strong></td><td>Lead eingetroffen, noch nicht kontaktiert</td></tr>
    <tr><td><strong>CONTACTED</strong></td><td>Erstkontakt erfolgt</td></tr>
    <tr><td><strong>ENGAGED</strong></td><td>Lead hat reagiert, bereit für Setter-Call</td></tr>
    <tr><td><strong>BOOKED</strong></td><td>Termin bestätigt mit Commitment</td></tr>
    <tr><td><strong>UNRESPONSIVE</strong></td><td>Kein Fit oder keine Antwort</td></tr>
    <tr><td><strong>EXIT</strong></td><td>Sauber geschlossen — kein Follow-Up mehr</td></tr>
  </tbody>
</table>

<h3>Pre-Call Layer</h3>
<table>
  <tbody>
    <tr><td><strong>PRE_CALL_PENDING</strong></td><td>Bestätigung gesendet, Reminder läuft</td></tr>
    <tr><td><strong>PRE_CALL_COMPLETED</strong></td><td>Alle Pre-Call-Schritte abgeschlossen</td></tr>
  </tbody>
</table>

<h3>Recovery Layer</h3>
<table>
  <tbody>
    <tr><td><strong>NO_SHOW</strong></td><td>Lead ist nicht zum Call erschienen</td></tr>
    <tr><td><strong>RECOVERY_PENDING</strong></td><td>Recovery-Kontakt eingeleitet</td></tr>
    <tr><td><strong>RECOVERY_BOOKED</strong></td><td>Neuer Termin nach No-Show</td></tr>
    <tr><td><strong>SECOND_NO_SHOW</strong></td><td>Zweiter No-Show — automatischer Exit</td></tr>
    <tr><td><strong>REACTIVATION_POOL</strong></td><td>Langzeit-Follow-Up ab Tag 30</td></tr>
  </tbody>
</table>
      `,
    },
    {
      id: 'phase-1',
      title: 'Phase 1 — Initial Contact',
      subtitle: '0–24h nach Lead-Eingang',
      content: `
<h3>Kanal-Logik</h3>
<ul>
  <li><strong>Telefonnummer vorhanden:</strong> WhatsApp + E-Mail parallel</li>
  <li><strong>Keine Telefonnummer:</strong> Nur E-Mail</li>
</ul>

<h3>Timing</h3>
<table>
  <tr><th>Ideal</th><td>&lt; 5 Minuten</td></tr>
  <tr><th>Maximum</th><td>24 Stunden</td></tr>
</table>

<h3>WhatsApp-Vorlage — Erstkontakt</h3>
<div class="script-line">„Hey [Name], ich hab gesehen, dass du dich für [Programm] interessierst. Darf ich kurz fragen — was hat dich dazu gebracht?"</div>
<p><strong>Ton:</strong> offen, kein Pitch, kein Druck — Gespräch starten.</p>
<p>Status: <strong>CONTACTED</strong></p>
      `,
    },
    {
      id: 'phase-2',
      title: 'Phase 2 — Follow-Up 1',
      subtitle: 'Tag 2 · Antwort erzwingen / Gespräch initiieren',
      content: `
<h3>Call-Zeitfenster</h3>
<p><strong>12:00 – 14:00</strong> oder <strong>17:30 – 19:30</strong></p>

<h3>Wenn kein Pickup — sofort danach:</h3>
<div class="script-line">„Hey [Name], hab gerade versucht dich zu erreichen. Wir haben aktuell noch wenige Plätze für ein kostenloses Strategiegespräch. Wenn du Interesse hast, hier direkt buchen: [Buchungslink]"</div>
<p>Niedrige Einstiegshürde — keine Erklärung, keine Entschuldigung.</p>
      `,
    },
    {
      id: 'phase-3',
      title: 'Phase 3 — Follow-Up 2',
      subtitle: 'Tag 4 · Letzte Aktivierung vor Exit',
      content: `
<h3>Call — Andere Uhrzeit als Tag 2</h3>
<p>z.B. 09:00 Uhr morgens oder nach 19:30 — bewusst außerhalb des Tag-2-Fensters.</p>

<h3>Wenn kein Pickup:</h3>
<div class="script-line">„Hey [Name], letzter Versuch meinerseits. Wir haben noch einen Platz frei — danach führe ich das Gespräch mit jemand anderem. Interesse noch da? Hier buchen: [Link]"</div>
<p><strong>Ton:</strong> ruhig, knapp, echte Verknappung — kein Fake-Druck.</p>
      `,
    },
    {
      id: 'phase-4',
      title: 'Phase 4 — Exit Message',
      subtitle: 'Tag 5 · Sauberer Abschluss',
      content: `
<div class="script-line">„Hey [Name], ich pausiere den Prozess von meiner Seite. Kein Vorwurf — manchmal passt der Zeitpunkt nicht. Wenn sich das ändert, weißt du wo du mich findest."</div>
<p><strong>Ton:</strong> Respektvoll. Kein Vorwurf. Kein „schade".</p>
<p>Status: <strong>EXIT</strong></p>
      `,
    },
    {
      id: 'phase-5',
      title: 'Phase 5 — Reactivation',
      subtitle: 'Ab Tag 30 · Langzeit-Recovery',
      content: `
<h3>Timing</h3>
<ul>
  <li>E-Mail 1: Tag 30</li>
  <li>E-Mail 2: Tag 45</li>
  <li>Optional: WhatsApp-Reminder nach E-Mail 2</li>
</ul>

<h3>E-Mail-Vorlage</h3>
<p><strong>Betreff:</strong> Noch aktuell für dich?</p>
<div class="script-line">„Hey [Name], vor einigen Wochen hattest du Interesse an [Programm]. Wir haben seitdem [X] neue Closer platziert. Falls der Moment jetzt passt: [Link]"</div>
<p>Kein Druck — Kontext + Einladung.</p>
<p>Status: <strong>REACTIVATION_POOL</strong></p>
      `,
    },
    {
      id: 'pre-call-layer',
      title: 'Layer 2 — Pre-Call Preparation',
      subtitle: 'Conversion Amplifier — zwischen BOOKED und SHOWED',
      content: `
<p><strong>Einordnung:</strong> Kein Follow-up — Vorbereitung. Ziel ist nicht mehr Terminbuchung, sondern <strong>maximale Show- und Close-Rate</strong>. Owner-Verantwortung bleibt beim Setter.</p>

<h3>Sequenz</h3>
<ul>
  <li><strong>Sofort nach Booking:</strong> Bestätigung + Kalendereintrag sichern</li>
  <li><strong>24h vor Call:</strong> Reminder mit Link</li>
  <li><strong>1h vor Call:</strong> Kurzer Warm-up-Kontakt</li>
</ul>

<h3>Vorlage — Buchungsbestätigung</h3>
<div class="script-line">„Hey [Name], dein Termin ist bestätigt — [Datum] um [Uhrzeit]. Ich freue mich auf unser Gespräch. Du erhältst kurz vorher noch eine Erinnerung."</div>
<p>Status: BOOKED → <strong>PRE_CALL_PENDING</strong></p>

<h3>Vorlage — Reminder (24h vorher)</h3>
<div class="script-line">„Hey [Name], morgen um [Uhrzeit] sprechen wir. Hier ist der Link: [Call-Link]. Gibt es vorab etwas, das du mitbringen möchtest?"</div>
<p>Status: PRE_CALL_PENDING → <strong>PRE_CALL_COMPLETED</strong></p>
      `,
    },
    {
      id: 'no-show-protocol',
      title: 'No-Show Protokoll (KRITISCH)',
      subtitle: 'Maximale Rückgewinnung',
      content: `
<div class="warn"><strong>KRITISCH:</strong> Kein No-Show wird kampflos aufgegeben. Maximale Rückgewinnung.</div>

<table>
  <thead><tr><th>Zeit</th><th>Maßnahme</th><th>Nachrichtentext</th></tr></thead>
  <tbody>
    <tr><td><strong>+5 Min.</strong></td><td>WhatsApp</td><td>„Hey [Name], wir hatten gerade einen Termin — alles okay bei dir?"</td></tr>
    <tr><td><strong>+30 Min.</strong></td><td>Call-Versuch</td><td>—</td></tr>
    <tr><td><strong>+3 Std.</strong></td><td>WhatsApp + Recovery-Link</td><td>„Kein Vorwurf. Hier ein neuer Link: [Recovery-Link]"</td></tr>
    <tr><td><strong>+24 Std.</strong></td><td>Letzter Call + Nachricht</td><td>„Ich versuch's ein letztes Mal."</td></tr>
  </tbody>
</table>

<div class="tip"><strong>Funnel-Separation (verbindliche Regel):</strong> Sobald ein Lead den Status NO_SHOW erreicht, stoppt der Standard-SOP-Flow (Follow-Up Tag 2 / Tag 4 / Exit Tag 5) vollständig. Der Recovery-Funnel startet als eigenständiger Prozess. Beide Flows dürfen nie gleichzeitig aktiv sein.</div>

<h3>Behavior-Trigger</h3>
<table>
  <tr><td><strong>Formular erneut besucht</strong></td><td>Sofort WhatsApp: „Hab gesehen, dass du nochmal reingeschaut hast — soll ich dir einen neuen Termin geben?"</td></tr>
  <tr><td><strong>E-Mail geöffnet (2×+)</strong></td><td>Follow-up um 2–4 Std vorziehen</td></tr>
  <tr><td><strong>Recovery-Link geklickt</strong></td><td>PRIORITY = HIGH — Owner-Reaktion innerhalb 30 Min Pflicht</td></tr>
  <tr><td><strong>Antwort eingegangen</strong></td><td>Sofort menschliche Übernahme — kein Auto-Reply</td></tr>
</table>
      `,
    },
    {
      id: 'owner-logic',
      title: 'Verantwortlichkeit — Owner-Logik',
      content: `
<table>
  <thead><tr><th>Layer</th><th>Owner</th><th>Reaktionspflicht</th></tr></thead>
  <tbody>
    <tr><td><strong>Standard-Flow</strong></td><td>Setter / Closer (Owner)</td><td>24h</td></tr>
    <tr><td><strong>Pre-Call</strong></td><td>Setter</td><td>Sofort nach Booking</td></tr>
    <tr><td><strong>No-Show Recovery</strong></td><td>Setter (Backup: Closer)</td><td>5 Min nach No-Show</td></tr>
    <tr><td><strong>Reactivation</strong></td><td>System / designierter Owner</td><td>Tag 30 automatisch</td></tr>
  </tbody>
</table>

<h3>Eskalationspfad</h3>
<table>
  <tr><td><strong>Stufe 1</strong></td><td>Owner reagiert nicht innerhalb der SLA</td><td>Backup-Owner übernimmt</td></tr>
  <tr><td><strong>Stufe 2</strong></td><td>Kein Backup verfügbar</td><td>Nastja / Nati informieren</td></tr>
  <tr><td><strong>Stufe 3</strong></td><td>Lead droht zu kippen / Beschwerde</td><td>Manuel oder Wolfgang direkt</td></tr>
</table>
      `,
    },
    {
      id: 'kpi-tracking',
      title: 'KPI Tracking — Erweiterter Layer',
      subtitle: 'Wöchentlich, alle Layer',
      content: `
<h3>Standard Flow</h3>
<table>
  <thead><tr><th>Metrik</th><th>Definition</th><th>Ziel</th></tr></thead>
  <tbody>
    <tr><td><strong>Lead Response Time</strong></td><td>Lead-Eingang → Erstkontakt</td><td>&lt; 5 Min.</td></tr>
    <tr><td><strong>Booking Rate</strong></td><td>Kontaktierte Leads → BOOKED</td><td>≥ 40 %</td></tr>
    <tr><td><strong>Exit Rate</strong></td><td>Leads → EXIT ohne Buchung</td><td>Analyse</td></tr>
  </tbody>
</table>

<h3>Pre-Call Layer</h3>
<table>
  <tbody>
    <tr><td><strong>Pre-Call Completion Rate</strong></td><td>BOOKED → PRE_CALL_COMPLETED</td><td>≥ 90 %</td></tr>
    <tr><td><strong>Show Rate</strong></td><td>PRE_CALL_COMPLETED → SHOWED</td><td>≥ 80 %</td></tr>
  </tbody>
</table>

<h3>Recovery Layer</h3>
<table>
  <tbody>
    <tr><td><strong>No-Show Rate</strong></td><td>BOOKED → NO_SHOW</td><td>&lt; 20 %</td></tr>
    <tr><td><strong>Recovery Rate</strong></td><td>NO_SHOW → RECOVERY_BOOKED</td><td>≥ 50 %</td></tr>
    <tr><td><strong>Recovery Show Rate</strong></td><td>RECOVERY_BOOKED → SHOWED</td><td>≥ 70 %</td></tr>
    <tr><td><strong>Recovery Close Rate</strong></td><td>Recovery-Termin → Close</td><td>≥ 40 %</td></tr>
    <tr><td><strong>Revenue / No-Show</strong></td><td>Durchschn. Umsatz pro NS-Lead</td><td>Monatlich</td></tr>
  </tbody>
</table>
      `,
    },
    {
      id: 'dont-do',
      title: 'Fehler, die nicht passieren dürfen',
      content: `
<div class="warn">
<ul>
  <li>❌ Lead > 24h nicht kontaktiert</li>
  <li>❌ Kein Follow-up nach Erstkontakt</li>
  <li>❌ Lead ohne Status / ohne Owner</li>
  <li>❌ Soft-Booking ohne Commitment</li>
  <li>❌ Kein Preframing vor dem Closer-Call</li>
  <li>❌ No-Show ohne Recovery-Sequenz gestartet</li>
  <li>❌ Lead ohne Exit — einfach „vergessen"</li>
  <li>❌ Lead > 48h ohne Status-Zuordnung</li>
  <li>❌ NO_SHOW ohne Recovery-Funnel-Start belassen</li>
  <li>❌ Standard-SOP und Recovery-Funnel gleichzeitig aktiv</li>
</ul>
</div>
      `,
    },
    {
      id: 'system-overview',
      title: 'Systemdenke — Closed-Loop Conversion System',
      content: `
<p><strong>Kein Messaging-Prozess.</strong></p>
<p>Ein Closed-Loop Conversion System aus drei Layern:</p>

<table>
  <tr><td><strong>Layer 1 — Lead Control</strong></td><td>Erstkontakt → BOOKED</td></tr>
  <tr><td><strong>Layer 2 — Pre-Call</strong></td><td>Conversion Amplifier</td></tr>
  <tr><td><strong>Layer 3 — Recovery</strong></td><td>Revenue Rescue Engine</td></tr>
</table>

<blockquote><strong>Jeder Lead endet in BOOKED oder EXIT.</strong><br/>Kein Lead bleibt in der Schwebe. Kein Lead wird vergessen. Das System schließt jeden Fall — systematisch, respektvoll, vollständig.</blockquote>
      `,
    },
  ],
};
