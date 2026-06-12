import styles from './TheClose.module.css';

export default function TheClose() {
  return (
    <div className={styles.page}>
      {/* ── SECTION 1 — HERO ── */}
      <section className={styles.hero}>
        <p className={styles.heroEyebrow}>Ethical Top Closer — The Close</p>

        <div className={styles.heroCounter}>
          <div className={styles.heroNow}>
            <div className={styles.heroNum}>580+</div>
            <div className={styles.heroLabel}>Heute</div>
          </div>
          <div className={styles.heroArrow}>→</div>
          <div className={styles.heroGoal}>
            <div className={styles.heroNum}><span>11.111</span></div>
            <div className={styles.heroLabel}>Die Mission</div>
          </div>
        </div>

        <p className={styles.heroClaim}>
          Du kannst closen.<br />
          <em>Die Frage ist: Warum bist du noch nicht dort, wo du sein solltest?</em>
        </p>

        <p className={styles.heroSub}>
          Nicht Skill. Nicht Talent. Zugang. Struktur. Positionierung.
        </p>
      </section>

      {/* ── SECTION 2 — TENSION STRIP ── */}
      <section className={styles.tensionStrip}>
        <p>
          Du bist nicht steckengeblieben, weil du nicht closen kannst.<br />
          Du bist steckengeblieben, weil niemand dich sieht.
        </p>
      </section>

      {/* ── SECTION 3 — DIFFERENTIATOR STRIP ── */}
      <section className={styles.diffStrip}>
        <div className={styles.diffItem}>
          <div className={styles.diffNum}>30+</div>
          <div className={styles.diffLabel}>Jahre kombinierte Vertriebserfahrung</div>
          <div className={styles.diffSub}>Infrastruktur vor Gespräch</div>
        </div>
        <div className={styles.diffItem}>
          <div className={styles.diffNum}>70/30</div>
          <div className={styles.diffLabel}>Zuhören zu Sprechen — unser Kern-KPI</div>
          <div className={styles.diffSub}>wer mehr redet als hört, verliert bereits</div>
        </div>
        <div className={styles.diffItem}>
          <div className={styles.diffNum}>100%</div>
          <div className={styles.diffLabel}>Placement nur nach nachgewiesenem Standard</div>
          <div className={styles.diffSub}>Zugang ist verdient — nicht gekauft</div>
        </div>
      </section>

      {/* ── SECTION 4 — TRUTH LAYER ── */}
      <section className={styles.truthLayer}>
        <div className={styles.truthItem}>
          <div className={styles.truthStat}>90%</div>
          <div className={styles.truthText}>
            der Closer die wir treffen haben das Problem <span className={styles.highlight}>nicht im Gespräch</span>.<br />
            Das Problem sitzt davor.
          </div>
        </div>
        <div className={styles.truthItem}>
          <div className={styles.truthStat}>Umfeld.</div>
          <div className={styles.truthText}>
            Wer gut closen kann aber im falschen System sitzt, verliert jeden Tag gegen
            jemanden der schlechter ist als er — aber die richtigen Deals sieht.
          </div>
        </div>
        <div className={styles.truthItem}>
          <div className={styles.truthStat}>Zugang.</div>
          <div className={styles.truthText}>
            Die Frage ist nicht ob du abschließt.<br />
            Die Frage ist, welche Deals du überhaupt siehst.
          </div>
        </div>
      </section>

      {/* ── SECTION 5 — BODY CONTAINER ── */}
      <div className={styles.bodyContainer}>
        {/* 5A — THE CLOSE HEADER */}
        <p className={styles.sectionEyebrow}>The Close — Platform</p>
        <h2 className={styles.sectionTitle}>
          Das LinkedIn<br />für Closer &amp; <em>Partner</em>
        </h2>
        <p className={styles.sectionDesc}>
          Closer werden gefunden. Unternehmen finden. Ein Netzwerk, das für beide Seiten
          arbeitet — täglich, aktiv, international.
        </p>
        <hr className={styles.sectionRule} />

        {/* 5B — PLATFORM TIERS */}
        <div className={styles.platformTiers}>
          {/* Silver */}
          <div className={`${styles.tierCard} ${styles.tierSilver}`}>
            <div className={styles.tierLabel}>Silver</div>
            <div className={styles.tierName}>Silver</div>
            <div className={styles.tierPrice}>€9</div>
            <div className={styles.tierPeriod}>pro Monat · jederzeit kündbar</div>
            <hr className={styles.tierDivider} />
            <ul className={styles.tierFeatures}>
              <li>Closer-Profil im ETC Directory</li>
              <li>Sichtbarkeit für Partner &amp; Unternehmen</li>
              <li>Basis-Eintrag im Job Board</li>
              <li>Zugang zur öffentlichen Community</li>
            </ul>
          </div>

          {/* Gold */}
          <div className={`${styles.tierCard} ${styles.tierGold}`}>
            <div className={styles.tierLabel}>Gold</div>
            <div className={styles.tierName}>Gold</div>
            <div className={styles.tierPrice}>€29</div>
            <div className={styles.tierPeriod}>pro Monat · jederzeit kündbar</div>
            <hr className={styles.tierDivider} />
            <ul className={styles.tierFeatures}>
              <li>Priorisierung — erscheint oben im Directory</li>
              <li>Weekly Job Updates vor allen anderen</li>
              <li>Monatliches Job Board — kuratierte Positionen</li>
              <li>Direkter Erstkontakt durch Partner</li>
              <li>Alles aus Silver</li>
            </ul>
          </div>

          {/* Platinum */}
          <div className={`${styles.tierCard} ${styles.tierPlatinum}`}>
            <span className={styles.tierBadge}>Beliebt</span>
            <div className={styles.tierLabel}>Platinum</div>
            <div className={styles.tierName}>Platinum</div>
            <div className={styles.tierPrice}>€79</div>
            <div className={styles.tierPeriod}>pro Monat · jederzeit kündbar</div>
            <hr className={styles.tierDivider} />
            <ul className={styles.tierFeatures}>
              <li>Quarterly Crossing — Community Events</li>
              <li>Webinare &amp; Coaching-Calls mit Top-Closern</li>
              <li>High-Ticket Coaches &amp; Speaker-Zugang</li>
              <li>Priorisierung + Gold-Benefits</li>
            </ul>
            <div className={styles.radiantTeaser}>
              ✦ Radiant — ab Juli 2026 inklusive
            </div>
          </div>

          {/* Black */}
          <div className={`${styles.tierCard} ${styles.tierBlack}`}>
            <div className={styles.tierLabel}>Black</div>
            <div className={styles.tierName}>Black</div>
            <div className={styles.tierPrice}>€199</div>
            <div className={styles.tierPeriod}>pro Monat · oder €1.499/Jahr</div>
            <hr className={styles.tierDivider} />
            <ul className={styles.tierFeatures}>
              <li><strong>Live Events</strong> — exklusive Retreats &amp; Reisen</li>
              <li><strong>Quarterly Crossing VIP</strong> — direkte Partner-Introductions</li>
              <li>Vorträge &amp; Masterminds mit den besten Closern Europas</li>
              <li>Priorität auf allen neuen Offers</li>
              <li>Alle Platinum-Benefits</li>
            </ul>
            <div className={styles.radiantTeaser}>
              ✦ Radiant Premium — ab Juli 2026 inklusive
            </div>
          </div>
        </div>

        {/* 5C — SPACER */}
        <div className={styles.spacer72} />

        {/* 5D — ETC PROGRAMM HEADER */}
        <p className={styles.sectionEyebrow}>ETC Programm — Auswahlprozess</p>
        <h2 className={styles.sectionTitle}>
          Du bist bereits im Sales.<br />
          <em>Das ist die Voraussetzung.</em>
        </h2>
        <p className={styles.sectionDesc}>
          Das Problem ist nicht dein Skill. Es ist deine Positionierung. ETC entscheidet,
          wer Zugang zu Level A Deals bekommt — und wer nicht.
        </p>
        <hr className={styles.sectionRule} />

        {/* 5E — PROGRAM TRACKS */}
        <div className={styles.programTracks}>
          {/* Track 01 — Fast Track */}
          <div className={styles.trackRow}>
            <div className={styles.trackIdentity}>
              <div>
                <div className={styles.trackNum}>Track 01</div>
                <div className={styles.trackName}>Fast Track</div>
                <div className={styles.trackTagline}>
                  Du hast bereits gezahlt und geliefert. Der Zugang kostet trotzdem — aber weniger.
                </div>
              </div>
              <div className={styles.trackBadge}>20% Rabatt</div>
            </div>
            <div className={styles.trackFeatures}>
              <ul>
                <li>Verkürztes Assessment mit einem Sparring-Partner aus unserem Team — welche Module kannst du überspringen?</li>
                <li><strong>ETC Vollprogramm</strong> — relevante Inhalte, keine Zeitverschwendung</li>
                <li><strong>EEG-Framework zertifiziert</strong> — die Methode hinter den besten Closern im DACH-Raum</li>
                <li><strong>Level A Placement</strong> nach Abschluss — kuratierte Partner, keine Massenvermittlung</li>
                <li><strong>The Close Gold inklusive</strong> — Directory, Job Board, Updates ab Tag 1</li>
              </ul>
            </div>
            <div className={styles.trackPrice}>
              <div className={styles.priceLabel}>Einmalig</div>
              <div className={styles.priceAmount} style={{ fontSize: 22 }}>3x €1.240</div>
              <div className={styles.priceSub}>statt 3x €1.550</div>
              <div className={styles.priceNote}>Nachweis erforderlich</div>
            </div>
          </div>

          {/* Track 02 — ETC Closer (Featured) */}
          <div className={`${styles.trackRow} ${styles.trackFeatured}`}>
            <div className={styles.trackIdentity}>
              <div>
                <div className={styles.trackNum}>Track 02</div>
                <div className={styles.trackName}>ETC Closer</div>
                <div className={styles.trackTagline}>
                  ETC ist kein Programm. Es ist ein Auswahlmechanismus.
                </div>
              </div>
              <div className={styles.trackBadge}>★ Der Auswahlprozess</div>
            </div>
            <div className={styles.trackFeatures}>
              <ul>
                <li><strong>9 Phasen. 33 Module.</strong> Wer durchkommt, wird placed. Wer nicht durchkommt, weiß warum.</li>
                <li><strong>Infrastruktur. Zugang. Positionierung.</strong> Nicht Technik — System.</li>
                <li><strong>Aktives Level A Placement</strong> — kuratierte Partner, keine Massenvermittlung</li>
                <li><strong>Booster</strong> — Praxis-Vertiefung nach dem Programm</li>
                <li><strong>The Close Platinum dauerhaft inklusive</strong> — Events, Community, Radiant ab Juli 2026</li>
                <li>Lifetime-Zugang zum ETC-Ökosystem als verifizierter Closer</li>
              </ul>
            </div>
            <div className={styles.trackPrice}>
              <div className={styles.priceLabel}>Einmalig</div>
              <div className={styles.priceAmount} style={{ fontSize: 22 }}>3x €1.550</div>
              <div className={styles.priceSub}>oder einmalig €4.650</div>
              <div className={styles.priceNote}>Vollständiger Zugang</div>
            </div>
          </div>

          {/* Track 03 — Champion Track */}
          <div className={styles.trackRow}>
            <div className={styles.trackIdentity}>
              <div>
                <div className={styles.trackNum}>Track 03</div>
                <div className={styles.trackName}>Champion Track</div>
                <div className={styles.trackTagline}>
                  Kein Vorab-Deal. Keine Ausnahmen. Wer liefert, bekommt alles zurück.
                </div>
              </div>
              <div className={styles.trackBadge}>Leistung vor Zahlung</div>
            </div>
            <div className={styles.trackFeatures}>
              <ul>
                <li>5 verifizierte Closes in 90 Tagen nach Deployment — nicht vorher, nicht verhandelbar</li>
                <li>Vollständige Rückerstattung nach Nachweis — das Risiko liegt bei dir, nicht bei uns</li>
                <li>Wer das nicht schafft, hat die Antwort auf eine wichtige Frage bekommen</li>
                <li>Mentor-Status für neue Closer in den ersten 4 Wochen (optional)</li>
                <li>Erst abschließen. Erst liefern. <strong>Dann kostenlos.</strong></li>
              </ul>
            </div>
            <div className={styles.trackPrice}>
              <div className={styles.priceLabel}>Nach Nachweis</div>
              <div className={styles.priceAmount}>€0</div>
              <div className={styles.priceSub}>Rückerstattung</div>
              <div className={styles.priceNote}>Für die, die liefern</div>
            </div>
          </div>
        </div>

        {/* 5F — OBJECTION HANDLING */}
        <div className={styles.objections}>
          <div className={styles.objectionBox}>
            <div className={styles.objectionQ}>Ich bin schon im Sales.</div>
            <div className={styles.objectionA}>
              Das ist die Voraussetzung, nicht das Argument. Die Frage ist welche Deals
              du siehst — und welche an jemand anderen gehen, der weniger kann als du.
            </div>
          </div>
          <div className={styles.objectionBox}>
            <div className={styles.objectionQ}>Ich habe schon in ein Programm investiert.</div>
            <div className={styles.objectionA}>
              Dann weißt du, was Zugang kostet. Fast Track erkennt das an. <strong>Der Standard bleibt — aber der Einstieg wird fairer.</strong>
            </div>
          </div>
        </div>

        {/* 5G — PREMIUM TEASER */}
        <div className={styles.premiumTeaser}>
          <div className={styles.premiumLeft}>
            <div className={styles.premiumLeftLabel}>Coming Next ✦</div>
            <div className={styles.premiumLeftName}>
              The Close <em>Premium</em>
            </div>
          </div>
          <div className={styles.premiumCenter}>
            ETC Badge auf dem Profil · Verifizierter Closer Status ·
            Maximale Sichtbarkeit bei Partner-Anfragen · Exklusiver Erstzugang zu neuen Offers
          </div>
          <div className={styles.premiumRight}>
            Bald verfügbar
          </div>
        </div>

        {/* 5H — CLOSING */}
        <div className={styles.closing}>
          <div className={styles.closingLeft}>
            <div className={styles.closingLabel}>Option A</div>
            <div className={styles.closingText}>
              <em>The Close — ab €9/Monat</em><br />
              Profil anlegen. Sichtbar werden. Schauen, welche Anfragen kommen.
            </div>
          </div>
          <div className={styles.closingRight}>
            <div className={styles.closingLabel}>Option B</div>
            <div className={styles.closingText}>
              <strong>ETC Programm — in die Auswahl gehen.</strong><br />
              Placed werden. Einer der <strong>11.111</strong> werden, die die erste DACH Brand
              mit dieser Geschichte tragen.
            </div>
          </div>
        </div>

        {/* 5I — FINAL STATEMENT BAR */}
        <div className={styles.finalStatement}>
          <p>
            Beides ist eine Entscheidung. <span>Eine davon verändert die nächsten 12 Monate.</span>
          </p>
        </div>

        {/* 5J — RULE FOOTER */}
        <div className={styles.ruleFooter}>
          Kein Closer wird placed ohne abgeschlossenes ETC-Programm
          <span className={styles.dot}>·</span>
          Alle Einstufungen werden von einem Sparring-Partner aus dem Team entschieden
          <span className={styles.dot}>·</span>
          The Close ist das Netzwerk — ETC ist der Standard
        </div>
      </div>
    </div>
  );
}
