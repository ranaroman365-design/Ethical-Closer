import type { DocumentData } from '@/components/playbooks/DocumentReader';

export const setterScriptV3: DocumentData = {
  id: 'setter-script-v3',
  title: 'Setter Call Script',
  version: 'GOLD STANDARD · v3 · High-Performance Edition',
  subtitle: 'Qualification & Booking Control Framework · High-Ticket Standard · L3/L4+',
  sections: [
    {
      id: 'overview',
      title: 'Übersicht & Kernprinzip',
      subtitle: 'Qualification & Booking Control Framework',
      content: `
<p>Das Setter-Skript ist die erste menschliche Kontaktstufe im ETC-Vertriebssystem. Es entscheidet, ob ein Lead einen Closer-Call bekommt oder nicht.</p>
<p>Es ist <strong>kein Verkaufsgespräch</strong>. Es ist ein Qualifikations- und Commitment-Sicherungs-Prozess. Der Setter pitcht nichts. Er filtert — präzise, respektvoll, systematisch.</p>
<blockquote><strong>KERNPRINZIP:</strong> Qualification over persuasion · Commitment over vague interest</blockquote>
<p><strong>Disqualifizieren ist ein gutes Ergebnis.</strong></p>

<h3>Rolle im ETC Revenue-System</h3>
<table>
  <tr><th>Funnel-Position</th><td>Lead → Booking — Der Setter operiert zwischen Interessent und Closer-Call</td></tr>
  <tr><th>Primärer Hebel</th><td>Booking-Rate (Ziel ≥ 40 %) + Show-Rate (Ziel ≥ 80 %)</td></tr>
  <tr><th>Systemanschluss</th><td>Review-Scoring: Framing / Clarity / Qualification / Commitment / Booking Control</td></tr>
  <tr><th>Abgrenzung Closer</th><td>Setter diagnostiziert an der Oberfläche. Closer diagnostiziert in der Tiefe.</td></tr>
</table>

<h3>7-Phasen-Struktur (gesperrt)</h3>
<table>
  <thead><tr><th>Phase</th><th>Dauer</th><th>Ziel</th></tr></thead>
  <tbody>
    <tr><td><strong>1</strong> FRAME</td><td>1–2 Min.</td><td>Kontrolle + Rahmen setzen</td></tr>
    <tr><td><strong>2</strong> SITUATION</td><td>3–4 Min.</td><td>Hintergrund auf Oberfläche</td></tr>
    <tr><td><strong>3</strong> MOTIVATION</td><td>3–4 Min.</td><td>Warum jetzt? Was soll sich ändern?</td></tr>
    <tr><td><strong>4</strong> FIT</td><td>2–3 Min.</td><td>Kapazität, Koachbarkeit, Ernst</td></tr>
    <tr><td><strong>5</strong> COMMITMENT</td><td>2–3 Min.</td><td>Echtes Ja sichern</td></tr>
    <tr><td><strong>6</strong> BOOKING</td><td>2–3 Min.</td><td>Termin + Preframing</td></tr>
    <tr><td><strong>7</strong> HANDOFF</td><td>2 Min.</td><td>Dokumentation für Closer</td></tr>
  </tbody>
</table>
<p>Gesamtdauer: <strong>15–20 Minuten</strong> · Vorbereitung: 5 Minuten</p>
      `,
    },
    {
      id: 'state-machine',
      title: 'System-Verbindung — SOP State Machine',
      content: `
<p>Das Setter-Skript greift exakt zwischen den Status <strong>ENGAGED</strong> und <strong>BOOKED</strong> im Lead Recovery & Conversion Protocol™. Kein Setter-Call ohne ENGAGED-Status. Kein Closer-Call ohne BOOKED-Status.</p>

<h3>Verantwortlichkeit im State-Modell</h3>
<table>
  <tr><th>Status bei Eingang</th><td><strong>ENGAGED</strong></td><td>Lead hat reagiert, ist bereit für Setter-Call</td></tr>
  <tr><th>Status bei Disqualifikation</th><td><strong>UNRESPONSIVE</strong></td><td>Kein Fit — sauber schließen</td></tr>
  <tr><th>Status bei Erfolg</th><td><strong>BOOKED</strong></td><td>Echter Termin + Commitment gesichert</td></tr>
  <tr><th>Handoff-Ziel</th><td><strong>PRE_CALL_PENDING</strong></td><td>Setter-Dokumentation startet Pre-Call-Layer</td></tr>
</table>

<div class="tip"><strong>No-Show-Übergabe:</strong> Wenn ein gebuchter Lead einen No-Show produziert, übernimmt das Recovery-Protokoll des SOP. Der Setter hat keine Rolle im Recovery-Funnel — es sei denn, er ist der designierte Owner.</div>

<h3>Handoff-Kette: Setter → Pre-Call → Closer</h3>
<table>
  <tr><th>Setter Phase 7</th><td>Motivation + Readiness + Risiko + Handoff-Notiz dokumentieren</td></tr>
  <tr><th>Pre-Call Layer</th><td>Bestätigung senden → PRE_CALL_PENDING → PRE_CALL_COMPLETED</td></tr>
  <tr><th>Closer Phase 1</th><td>Handoff lesen — kein doppelter Neustart, Closer startet informiert</td></tr>
</table>
      `,
    },
    {
      id: 'pre-call',
      title: 'Pre-Call Vorbereitung',
      subtitle: '5 Min. vor jedem Call',
      content: `
<h3>Pre-Call Checklist</h3>
<ul>
  <li>Bewerbung / Lead-Formular gelesen — Name, Hintergrund, Herkunft bekannt</li>
  <li>Quiz-Ergebnisse oder Vorkontakt-Daten geprüft</li>
  <li><strong>Mindset:</strong> Mein Job ist qualifizieren — nicht informieren, nicht pitchen</li>
  <li><strong>Mindset:</strong> Abschneiden ist der beste Service — erzwingt keine Closer-Call-Verschwendung</li>
  <li>Bei Sales-Hintergrund: Experienced Lead Track vorbereiten (Phase 3–5)</li>
  <li>Aufnahme starten (vor dem ersten Wort)</li>
  <li>Ruhige Umgebung, keine Ablenkung — 15–20 Minuten eingeplant</li>
  <li>Frame-Eröffnung parat: <em>Ich stelle Fragen, keine Infos. Fair?</em></li>
  <li>Akzeptanz vorbereitet: <strong>Disqualifizieren ist ein gutes Ergebnis.</strong></li>
</ul>
      `,
    },
    {
      id: 'phase-1-frame',
      title: 'Phase 1 — FRAME',
      subtitle: '1–2 Min. · Kontrolle + Rahmen setzen',
      content: `
<p>Der Frame bestimmt, wer das Gespräch führt. Ohne gesetzten Frame übernimmt der Lead die Kontrolle — und fragt nach Preisen, erklärt seine Situation ausführlich, oder behandelt den Setter wie eine Info-Hotline. Der Frame macht klar: <strong>Das hier ist eine Qualifikation, kein Infogespräch.</strong></p>

<div class="script-line">„Ich werde dir ein paar gezielte Fragen stellen, um zu verstehen, ob ein Gespräch mit einem unserer Closer sinnvoll für dich ist. Wenn das der Fall ist, buchst du direkt im Anschluss. Wenn nicht, sage ich dir das ehrlich. Einverstanden?"</div>

<div class="tip"><strong>TON:</strong> Ruhig. Klar. Null Verkaufsenergie. Kein Small Talk davor.</div>

<p><strong>PAUSE nach dem Frame.</strong> Auf explizites „Ja" oder „Okay" warten. Kein Weitermachen bevor die Zustimmung da ist.</p>
      `,
    },
    {
      id: 'phase-2-situation',
      title: 'Phase 2 — SITUATION',
      subtitle: '3–4 Min. · Hintergrund auf Oberflächen-Level',
      content: `
<p>Phase 2 ist keine tiefe Diagnose. Sie ist ein schneller Baseline-Check: <strong>Wer ist dieser Mensch beruflich?</strong> Ist das Grundprofil passend? Mehr nicht.</p>

<div class="script-line">» Was machst du beruflich aktuell?</div>
<div class="script-line">» Wie sieht deine Einkommenssituation im Moment aus?</div>
<div class="script-line">» Arbeitest du fest angestellt, selbständig oder suchst du gerade etwas Neues?</div>

<div class="warn"><strong>ÜBERGANGSREGEL:</strong> Sobald Baseline klar ist, weiterziehen. Nicht vertiefen. Nicht analysieren. Keine Coaching-Energie.</div>
      `,
    },
    {
      id: 'phase-3-motivation',
      title: 'Phase 3 — MOTIVATION',
      subtitle: '3–4 Min. · Warum jetzt — Oberflächenmotivation identifizieren',
      content: `
<p>Phase 3 klärt: Was ist der Auslöser für diesen Kontakt? Das gibt dem Closer den Kontext, den er braucht. Der Setter geht nicht tief — er skizziert nur das Grundbild.</p>

<div class="script-line">» Was hat dich dazu gebracht, dich bei uns zu melden?</div>
<div class="script-line">» Was läuft gerade nicht so, wie du es dir vorstellst?</div>
<div class="script-line">» Was würdest du dir wünschen, das sich in den nächsten 6–12 Monaten verändert?</div>

<div class="tip"><strong>WICHTIGE GRENZE:</strong> Wenn der Lead tiefer gehen will — „Das ist genau der Punkt, den du mit dem Closer in der Tiefe besprechen wirst. Für mich reicht es jetzt zu verstehen, dass das ein Thema für dich ist."</div>

<h3>🆕 Experienced Lead Track — Phase 3</h3>
<p>Aktivieren wenn Lead Sales-Hintergrund erwähnt — ersetzt/ergänzt Standard-Fragen.</p>

<h4>Existing Closer Check</h4>
<p>Direkter Einstieg ohne Small Talk:</p>
<div class="script-line">„Nur damit ich es richtig verstehe: Du bist already im Sales — was läuft aktuell NICHT so, wie du willst?"</div>
<p><strong>TON:</strong> Direkt. Keine Einleitung. Warten auf Antwort.</p>

<h4>Identity Break</h4>
<p>Nach Antwort — Selbstreflexion, kein Angriff:</p>
<div class="script-line">„Wenn es perfekt laufen würde — wärst du dann überhaupt hier im Gespräch?"</div>
<p><strong>TON:</strong> Ruhig. Keine Erklärung. Pause zulassen. Stille halten. Antwort abwarten. Nicht helfen.</p>
      `,
    },
    {
      id: 'phase-4-fit',
      title: 'Phase 4 — FIT / READINESS',
      subtitle: '2–3 Min. · Ist dieser Lead bereit für das ETC-System?',
      content: `
<p>Das ist der <strong>entscheidende Filter</strong>. Hier entscheidet sich, ob ein Closer-Call sinnvoll ist. Drei Dimensionen werden geprüft: <strong>Kapazität, Koachbarkeit, Ernsthaftigkeit.</strong></p>

<div class="script-line">» Bist du in einer Position, wo du 15–20 Stunden pro Woche in etwas Neues investieren könntest?</div>
<div class="script-line">» Wenn du mit jemandem arbeitest — bist du jemand, der einem strukturierten Prozess folgen kann?</div>
<div class="script-line">» Bist du in einer Situation, wo du grundsätzlich in deine eigene Entwicklung investieren könntest?</div>

<h3>Qualifikations-Signale</h3>
<table>
  <tr><td><strong>Qualifiziert</strong></td><td>Klares Ja, Energie, konkrete Antworten</td><td>Weiter zu Phase 5</td></tr>
  <tr><td><strong>Unsicher</strong></td><td>Zögern, vage, weicht aus</td><td>Direkt: „Was hält dich zurück?"</td></tr>
  <tr><td><strong>Nicht qualifiziert</strong></td><td>Kein Zeit, kein Geld, kein Interesse</td><td>Sauber disqualifizieren</td></tr>
</table>

<h3>🆕 Experienced Lead Track — Phase 4</h3>
<h4>Reality Mirror</h4>
<p>Beobachtung, kein Vorwurf:</p>
<div class="script-line">„Die meisten, die schon im Sales sind, stehen genau an einem Punkt: Viel Aktivität — aber kein System, das konstant liefert."</div>
<p><strong>TON:</strong> Neutral. Beobachtend. Keine Anklage. Pause danach.</p>

<h4>Micro-Confrontation</h4>
<div class="script-line">„Was fehlt aktuell noch, damit das wirklich skaliert?"</div>
<p><strong>TON:</strong> Pause nach der Frage. Nicht weiterreden. <strong>Echte Antwort braucht Stille.</strong></p>

<h3>Disqualifikation</h3>
<div class="script-line">„Auf Basis von dem, was du mir gerade erklärt hast, ergibt ein Gespräch mit unserem Closer für dich heute keinen Sinn. Wenn sich deine Situation ändert, kannst du dich gerne wieder melden."</div>
<p><strong>TON:</strong> Klar. Respektvoll. Kein Weichzeichnen. Kein Trost.</p>
      `,
    },
    {
      id: 'phase-5-commitment',
      title: 'Phase 5 — COMMITMENT',
      subtitle: '2–3 Min. · Echtes Ja sichern — nicht nur Interesse',
      content: `
<p>Ein gebuchter Termin ist <strong>kein</strong> Commitment. Commitment ist wenn der Lead explizit verstanden hat, was auf ihn zukommt — und trotzdem „Ja" sagt. Weiche Buchungen produzieren No-Shows. <strong>Echtes Commitment produziert Show Rate > 80 %.</strong></p>

<div class="script-line">„Wenn du mit unserem Closer sprichst und das Gespräch ergibt, dass das ein starker Fit ist — bist du in der Lage, an dem Tag eine Entscheidung zu treffen? Nicht: ‚Mal schauen.' Ich meine: Bist du wirklich bereit dafür?"</div>
<p><strong>TON:</strong> Direkt. Klar. Nicht entschuldigend. Pause nach der Frage.</p>

<div class="warn"><strong>COMMITMENT-REGEL:</strong> Zögern oder „mal schauen" ist kein Ja. Direkt ansprechen: „Was würde dich davon abhalten, an dem Tag zu entscheiden?" Wenn kein klares Ja: Booking-Termin verschieben oder disqualifizieren.</div>

<h3>🆕 Decision Close — Ersetzt Binary Pressure</h3>
<p>Kein „oder nicht?" — Decision Mastery: Entscheidung entsteht intern.</p>
<div class="script-line">„Wenn das hier der nächste Schritt ist — was brauchst du, um heute eine Entscheidung zu treffen?"</div>
<p><strong>TON:</strong> Ruhig. Souverän. Pause. Nicht nachsetzen. <strong>Wer zuerst redet, verliert den Frame.</strong></p>
      `,
    },
    {
      id: 'phase-6-booking',
      title: 'Phase 6 — BOOKING CONTROL',
      subtitle: '2–3 Min. · Termin buchen + Show-Wahrscheinlichkeit maximieren',
      content: `
<div class="script-line">„Gut. Dann buchen wir das jetzt direkt. Ich schicke dir einen Link — klick den bitte sofort, damit der Termin in deinem Kalender ist. [Warte auf Bestätigung der Buchung] Perfekt. Du wirst einen Reminder bekommen: 24 Stunden vorher, 3 Stunden vorher, 30 Minuten vorher. Sei pünktlich — der Closer wartet auf dich."</div>
<p><strong>TON:</strong> Strukturiert. Organisiert. Kein Druck — aber Klarheit.</p>

<h3>Preframing des Closer-Calls</h3>
<div class="script-line">„Kurz noch etwas, damit du gut vorbereitet reingehst: Der Closer wird dir gezielte Fragen stellen — tiefer als ich heute. Er will verstehen, wo du wirklich stehst und ob das System für dich passt. Du musst nichts vorbereiten. Sei einfach ehrlich. Das Gespräch dauert 45 bis 60 Minuten. Wenn es ein Fit ist, wirst du eine Entscheidung treffen. Nicht ‚dann schaue ich mir das an' — sondern eine echte Entscheidung. Ist das für dich okay so?"</div>
<p><strong>TON:</strong> Ruhig, klar. Pause nach der letzten Frage. Auf explizites Ja warten.</p>

<div class="tip"><strong>Preframing-Ziel:</strong> Der Lead weiß, was ihn erwartet. Keine Überraschung im Closer-Call. Wer „Nein" auf das Preframing sagt, wäre ein No-Show geworden.</div>
      `,
    },
    {
      id: 'phase-7-handoff',
      title: 'Phase 7 — HANDOFF',
      subtitle: '2 Min. · Relevante Infos für den Closer dokumentieren',
      content: `
<p>Phase 7 ist kein gesprochener Schritt — sie ist <strong>interne Dokumentation</strong> direkt nach dem Call. Ein guter Handoff gibt dem Closer den Kontext, den er braucht, ohne bei null anfangen zu müssen.</p>

<div class="tip"><strong>HANDOFF-REGEL:</strong> Der Closer sollte wissen: (1) Wer ist das? (2) Was ist die Hauptmotivation? (3) Wo liegt das größte Risiko? (4) Was ist der wichtigste Gesprächspunkt?</div>

<table>
  <tr><th>Datum</th><td>[___]</td><th>Setter</th><td>[___]</td></tr>
  <tr><th>Lead-Name</th><td>[___]</td><th>Qualifiziert</th><td>JA / NEIN</td></tr>
  <tr><th>Risiko No-Show</th><td>NIEDRIG / MITTEL / HOCH</td><th>Level</th><td>L3 / L4 / L4+</td></tr>
  <tr><th>Sales-Hintergrund</th><td colspan="3">JA / NEIN — Experienced Lead Track aktiviert: JA / NEIN</td></tr>
</table>

<h4>Dokumentationsfelder</h4>
<ul>
  <li><strong>Aktuelles Hauptproblem / Motivation</strong></li>
  <li><strong>Zielvorstellung</strong> (in eigenen Worten des Leads)</li>
  <li><strong>Readiness-Einschätzung</strong> (Koachbarkeit, Ernst, Prozess-Bereitschaft)</li>
  <li><strong>Risikofaktoren</strong> für No-Show oder Einwand im Closer-Call</li>
  <li><strong>Handoff-Notiz für Closer</strong> (1–2 Sätze)</li>
</ul>
      `,
    },
    {
      id: 'question-bank',
      title: 'Question Bank — Nach Phase',
      content: `
<p>Diese Fragen sind erprobt, hochsignifikant und direkt trainierbar. <strong>Jede Frage hat genau einen Zweck. Keine Füllerfragen.</strong></p>

<h3>SITUATION</h3>
<ul>
  <li>» Was machst du beruflich aktuell?</li>
  <li>» Wie sieht deine Einkommenssituation im Moment aus?</li>
  <li>» Arbeitest du angestellt, selbständig oder suchst du gerade etwas?</li>
</ul>

<h3>MOTIVATION</h3>
<ul>
  <li>» Was hat dich dazu gebracht, dich hier zu melden?</li>
  <li>» Was läuft gerade nicht so, wie du es dir vorstellst?</li>
  <li>» Was würdest du dir für die nächsten 6–12 Monate wünschen?</li>
</ul>

<h3>FIT / READINESS</h3>
<ul>
  <li>» Könntest du 15–20 Stunden pro Woche in etwas Neues investieren?</li>
  <li>» Bist du jemand, der einem strukturierten Prozess folgen kann?</li>
  <li>» Bist du in einer Position, wo du grundsätzlich in dich investieren könntest?</li>
</ul>

<h3>COMMITMENT</h3>
<ul>
  <li>» Wenn das ein starker Fit ist — bist du bereit, an dem Tag eine Entscheidung zu treffen?</li>
  <li>» Was würde dich davon abhalten, an dem Call zu erscheinen?</li>
  <li>» Hast du den Termin schon in deinem Kalender eingetragen?</li>
</ul>

<h3>Commitment-Sprache — Wort-für-Wort</h3>
<div class="script-line">„Ich möchte nur sicherstellen, dass das kein ‚mal schauen' ist. Du erscheinst wirklich — oder?"</div>
<div class="script-line">„Ich höre, dass da noch etwas ist. Was ist das konkret? Ich frage, weil ein weiches Ja keinem von euch hilft."</div>
      `,
    },
    {
      id: 'objections',
      title: 'Einwandbehandlung — Setter-Bibliothek',
      subtitle: '11 Einwände mit Do/Don\'t',
      content: `
<div class="tip"><strong>SETTER-PRINZIP:</strong> Einwände werden nicht verkauft oder überwunden. Sie werden auf Klarheit geprüft — dann qualifiziert oder disqualifiziert. Kein Überreden. Kein Druck. Klarheit herstellen.</div>
      `,
      children: [
        {
          id: 'obj-1', title: 'Einwand 1 — „Ich will erst mal Infos."',
          content: `<p>❌ <strong>Informieren:</strong> „Klar, ich erkläre dir kurz was wir machen — also das System ist..."</p><p>✅ <strong>Klarheit herstellen:</strong></p><div class="script-line">„Das ist genau die Aufgabe des Closer-Calls. Ich kläre nur, ob das für dich sinnvoll ist. Darf ich dir dazu ein paar Fragen stellen?"</div>`
        },
        {
          id: 'obj-2', title: 'Einwand 2 — „Kannst du das Angebot erklären?"',
          content: `<p>❌ <strong>Pitchen:</strong> „Also bei uns kostet das Programm..."</p><p>✅ <strong>Rolle klären:</strong></p><div class="script-line">„Die Details erklärt dir der Closer direkt — das ist nicht meine Aufgabe. Ich stelle fest, ob ein Gespräch überhaupt Sinn macht."</div>`
        },
        {
          id: 'obj-3', title: 'Einwand 3 — „Ich muss erst überlegen."',
          content: `<p>❌ <strong>Überzeugen:</strong> „Das verstehe ich, aber lass mich dir erklären warum es sich lohnt..."</p><p>✅ <strong>Unklarheit aufdecken:</strong></p><div class="script-line">„Was genau ist noch unklar? Wenn du nicht weißt ob das für dich ist — genau dafür ist das Gespräch mit dem Closer."</div>`
        },
        {
          id: 'obj-4', title: 'Einwand 4 — „Ich habe keine Zeit."',
          content: `<p>❌ <strong>Beschwichtigen:</strong> „Das dauert wirklich nicht lange, nur 30 Minuten..."</p><p>✅ <strong>Priorität prüfen:</strong></p><div class="script-line">„Für 30 Minuten geht es um dein nächstes Jahr. Die Frage ist: Ist das gerade eine Priorität — oder nicht?"</div>`
        },
        {
          id: 'obj-5', title: 'Einwand 5 — „Ich weiß nicht ob ich bereit bin."',
          content: `<p>❌ <strong>Motivieren:</strong> „Ich glaube du bist bereit! Du hast dich ja gemeldet..."</p><p>✅ <strong>Konkret werden:</strong></p><div class="script-line">„Was genau macht dich unsicher? Wir können jetzt klären ob das Timing passt — oder nicht."</div>`
        },
        {
          id: 'obj-6', title: 'Einwand 6 — „Können wir das locker buchen?"',
          content: `<p>❌ <strong>Akzeptieren:</strong> „Ja natürlich, wir buchen mal provisorisch..."</p><p>✅ <strong>Soft-Booking ablehnen:</strong></p><div class="script-line">„Locker buchen macht für keinen Sinn. Wenn du buchst, erscheinst du. Bist du dazu wirklich bereit?"</div>`
        },
        {
          id: 'obj-7', title: 'Einwand 7 — „Ich schaue später mal in meinen Kalender."',
          content: `<p>❌ <strong>Warten:</strong> „Kein Problem, meld dich dann einfach..."</p><p>✅ <strong>Jetzt direkt buchen:</strong></p><div class="script-line">„Dann machen wir das jetzt direkt gemeinsam — ich warte kurz während du nachschaust."</div>`
        },
        {
          id: 'obj-8', title: 'Einwand 8 — „Ich habe auch andere Programme gesehen."',
          content: `<p>❌ <strong>Vergleichen:</strong> „Wir sind besser als XY weil..."</p><p>✅ <strong>Qualifikation fokussieren:</strong></p><div class="script-line">„Das macht Sinn. Was uns unterscheidet, erklärt dir der Closer direkt. Meine Frage an dich ist nur: Passt das hier grundsätzlich zu dem, was du willst?"</div>`
        },
        {
          id: 'obj-9', title: 'Einwand 9 — „Ich muss erst mit meinem Partner sprechen."',
          content: `<p>❌ <strong>Vertagen:</strong> „Klar, kein Problem — sprich mit ihr/ihm und meld dich dann wieder..."</p><p>✅ <strong>Entscheidungsstruktur klären:</strong></p><div class="script-line">„Das ist völlig legitim. Darf ich fragen: Wenn dein Partner Ja sagt — bist du dann selbst bereit? Weil wenn du selbst noch nicht weißt, ob das für dich stimmt, ergibt das Gespräch mit dem Partner noch keinen Sinn."</div>`
        },
        {
          id: 'obj-10', title: 'Einwand 10 — „Ich hab sowas schon mal versucht."',
          content: `<p>❌ <strong>Verteidigen:</strong> „Das ist bei uns anders, wir haben ein einzigartiges System das..."</p><p>✅ <strong>Ursache diagnostizieren:</strong></p><div class="script-line">„Das nehme ich ernst. Was genau hat nicht funktioniert — das System, deine Situation damals, oder die Umsetzung? Das ist genau das, was der Closer mit dir in der Tiefe anschaut."</div>`
        },
        {
          id: 'obj-11', title: '🆕 Einwand 11 — „Ich bin schon im Sales."',
          content: `<p>Häufigster Einwand erfahrener Leads — Status respektieren, Klarheit erzeugen.</p><p>❌ <strong>Relativieren:</strong> „Das macht Sinn, aber unser System ist trotzdem anders weil..."</p><p>✅ <strong>Status nutzen:</strong></p><div class="script-line">„Genau deswegen macht das hier Sinn. Nicht für Anfänger — für Leute, die bereits wissen wie Sales funktioniert, aber auf ein anderes Level wollen."</div><div class="warn"><strong>WICHTIG:</strong> Kein Vergleich. Kein „aber wir sind anders". Status des Leads bestätigen — und genau deshalb als relevanten Kandidaten positionieren. Kein Weichzeichnen. Keine Entschuldigung.</div>`
        },
      ],
    },
    {
      id: 'deviation-tree',
      title: 'Call-Abweichungs-Baum & Post-Call',
      content: `
<h3>Was tun, wenn der Call aus dem Rahmen läuft?</h3>
<p>Jede Abweichung hat eine klare, phasen-basierte Antwort.</p>
<table>
  <thead><tr><th>Situation</th><th>Phase</th><th>Antwort</th></tr></thead>
  <tbody>
    <tr><td>Lead fragt Preis zu früh</td><td>Vor Phase 5</td><td>„Den Preis erklärt der Closer direkt — das ist nicht mein Job."</td></tr>
    <tr><td>Lead will alle Details</td><td>Vor Phase 5</td><td>„Das ist genau Aufgabe des Closer-Calls. Ich kläre nur ob es Sinn macht."</td></tr>
    <tr><td>Lead redet zu viel</td><td>Jede Phase</td><td>„Darf ich kurz unterbrechen? Ich brauche eine kurze Antwort auf meine Frage."</td></tr>
    <tr><td>Lead ist vage</td><td>Phase 2–3</td><td>„Ich brauche etwas Konkretes. Kannst du mir ein Beispiel geben?"</td></tr>
    <tr><td>Lead vermeidet Commitment</td><td>Phase 5</td><td>„Ich höre, dass etwas zögert. Was ist das konkret?"</td></tr>
    <tr><td>Lead will ohne Grund verschieben</td><td>Phase 5–6</td><td>„Was ändert sich in 2 Wochen, das jetzt noch nicht möglich ist?"</td></tr>
    <tr><td>Lead interessiert aber nicht ernst</td><td>Phase 4</td><td>Fit-Phase intensivieren. Wenn kein klares Ja: Kein Booking.</td></tr>
    <tr><td>Lead ist klar nicht qualifiziert</td><td>Phase 4</td><td>„Ein Closer-Call ergibt gerade keinen Sinn. Wenn sich deine Situation ändert, meld dich."</td></tr>
  </tbody>
</table>

<h3>Post-Call Protokoll</h3>
<table>
  <tr><th>Qualifiziert?</th><td>JA / NEIN / FOLLOW-UP</td></tr>
  <tr><th>Grund (falls NEIN)</th><td>Kein Geld / Kein Zeit / Kein Fit / Kein Commitment</td></tr>
  <tr><th>No-Show-Risiko</th><td>Niedrig / Mittel / Hoch + Begründung</td></tr>
  <tr><th>Motivation in einem Satz</th><td>Was will dieser Mensch wirklich?</td></tr>
  <tr><th>Readiness-Einschätzung</th><td>1 (gar nicht) bis 5 (vollständig bereit)</td></tr>
  <tr><th>Nächster Schritt</th><td>Closer-Call gebucht / Disqualifiziert / Follow-up in X Tagen</td></tr>
</table>
      `,
    },
    {
      id: 'review-scoring',
      title: 'Call Review Scoring-Bogen',
      content: `
<p>Für jede Dimension wird eine Bewertung von <strong>1</strong> (nicht vorhanden) bis <strong>5</strong> (exzellent) vergeben. Gesamt-Benchmark: <strong>≥ 21 von 25 Punkten.</strong></p>

<table>
  <thead><tr><th>Dimension</th><th>Beschreibung</th><th>Min</th></tr></thead>
  <tbody>
    <tr><td><strong>Framing</strong></td><td>Wurde Kontrolle vom ersten Satz an gesetzt?</td><td>≥ 4</td></tr>
    <tr><td><strong>Clarity</strong></td><td>War die Qualifikation klar und strukturiert?</td><td>≥ 4</td></tr>
    <tr><td><strong>Qualification</strong></td><td>War die Fit-Phase präzise und filter-orientiert?</td><td>≥ 4</td></tr>
    <tr><td><strong>Commitment</strong></td><td>Wurde echtes Commitment gesichert (kein Soft-Booking)?</td><td>≥ 4</td></tr>
    <tr><td><strong>Booking Control</strong></td><td>War der Termin sauber gebucht mit Preframing + Reminder-Logik?</td><td>≥ 5</td></tr>
  </tbody>
</table>
      `,
    },
    {
      id: 'follow-up-scripts',
      title: 'Follow-Up Skripte — Wort-für-Wort',
      content: `
<p>Jedes Ergebnis hat ein definiertes Follow-up. <strong>Keine Improvisation. Kein Druck. Kein mehrfaches Nachhaken.</strong></p>

<h3>Qualifiziert — Noch nicht gebucht (1× senden nach dem Call)</h3>
<div class="script-line">„Hey [Name], hier der Link für unser Gespräch mit dem Closer: [Link]. Bitte buch direkt — offene Slots gehen erfahrungsgemäß schnell weg."</div>

<h3>Nicht qualifiziert — Sauberer Exit</h3>
<div class="script-line">„Hey [Name], danke für das offene Gespräch. Aktuell ist das nicht der richtige Moment für dich — und das ist okay. Wenn sich was ändert, weißt du wo du mich findest."</div>

<h3>Unsicher — Nur 1 Follow-Up (48h nach Call)</h3>
<div class="script-line">„Ich wollte kurz nachhaken: Bist du zu einer Entscheidung gekommen, ob du das Gespräch führen möchtest? Wenn nicht — kein Problem. Dann schließe ich deinen Kontakt hier."</div>
<p>Einmal senden. Danach: Status „Inaktiv".</p>
      `,
    },
    {
      id: 'benchmarks',
      title: 'Performance-Benchmarks',
      content: `
<p><strong>Soft-Booking-Rate ist das wichtigste Signal für Setter-Qualität:</strong> Jede Buchung ohne echtes Commitment ist eine verschwendete Closer-Stunde.</p>

<table>
  <thead><tr><th>Metrik</th><th>Ziel</th><th>Anmerkung</th></tr></thead>
  <tbody>
    <tr><td><strong>Booking Rate</strong></td><td>≥ 40 %</td><td>Qualifizierte Leads → gebuchte Calls</td></tr>
    <tr><td><strong>Show Rate</strong></td><td>≥ 80 %</td><td>Gebuchte Calls → tatsächlich erschienen</td></tr>
    <tr><td><strong>Soft-Booking Rate</strong></td><td>≤ 5 %</td><td>Buchungen ohne echtes Commitment</td></tr>
    <tr><td><strong>Disqualifikations-Rate</strong></td><td>20–35 %</td><td>Gesunde Quote = Qualität</td></tr>
    <tr><td><strong>Pre-Call Completion</strong></td><td>≥ 90 %</td><td>Reminder + Bestätigung abgeschlossen</td></tr>
  </tbody>
</table>
      `,
    },
  ],
};
