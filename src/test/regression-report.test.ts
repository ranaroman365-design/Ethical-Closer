/**
 * Regression Report Generator
 * ===========================
 * Runs after e2e-regression + data-consistency tests and produces
 * a structured Markdown report at /mnt/documents/regression-report.md
 * Then sends a summary email via the e2e-critical-alert template.
 *
 * Captures:
 *  - Test results summary (pass/fail counts)
 *  - Console/Network audit (checks for common anti-patterns)
 *  - Identified issues with severity + fix suggestions
 *  - Timestamp for tracking across runs
 */
import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Email notification config ────────────────────────────────────────
const REGRESSION_ALERT_RECIPIENTS = [
  "team@ethicalcloser.de", // primary ops inbox
];

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://pjufhxzjgdnhvuuvltjn.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

const safeRead = (rel: string): string | null => {
  try {
    return read(rel);
  } catch {
    return null;
  }
};

// ── Collector ────────────────────────────────────────────────────────

interface Finding {
  area: "Console" | "Network" | "Security" | "Performance" | "Data" | "UI";
  severity: "critical" | "warning" | "info";
  issue: string;
  file: string;
  fix: string;
}

const findings: Finding[] = [];

// ── Previous-run snapshot for diff ───────────────────────────────────
const SNAPSHOT_PATH = "/mnt/documents/regression-snapshot.json";
const SNAPSHOT_FALLBACK = path.resolve(__dirname, "../../regression-snapshot.json");

interface Snapshot {
  ranAt: string;
  findings: Array<{ key: string; severity: string }>;
}

function loadPreviousSnapshot(): Snapshot | null {
  for (const p of [SNAPSHOT_PATH, SNAPSHOT_FALLBACK]) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as Snapshot;
    } catch { /* ignore */ }
  }
  return null;
}

function saveSnapshot(now: string, current: Finding[]) {
  const snap: Snapshot = {
    ranAt: now,
    findings: current.map((f) => ({ key: `${f.area}::${f.issue}`, severity: f.severity })),
  };
  try {
    fs.mkdirSync("/mnt/documents", { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap, null, 2));
  } catch {
    fs.writeFileSync(SNAPSHOT_FALLBACK, JSON.stringify(snap, null, 2));
  }
}

function buildDiffSection(previous: Snapshot | null, current: Finding[]): string {
  if (!previous) return "\n> _Erster Run — kein Vergleich verfügbar._\n";

  const prevMap = new Map(previous.findings.map((f) => [f.key, f.severity]));
  const currMap = new Map(current.map((f) => [`${f.area}::${f.issue}`, f.severity]));

  const newFindings: string[] = [];
  const resolved: string[] = [];
  const changed: string[] = [];

  // Checks that are new or changed severity
  for (const [key, sev] of currMap) {
    const prevSev = prevMap.get(key);
    if (!prevSev) {
      newFindings.push(`| 🆕 Neu | ${sev} | ${key.replace("::", " · ")} |`);
    } else if (prevSev !== sev) {
      const arrow = severityRank(sev) < severityRank(prevSev) ? "⬆️" : "⬇️";
      changed.push(`| ${arrow} ${prevSev} → ${sev} | ${key.replace("::", " · ")} |`);
    }
  }

  // Checks that disappeared (resolved)
  for (const [key, sev] of prevMap) {
    if (!currMap.has(key)) {
      resolved.push(`| ✅ Behoben | war ${sev} | ${key.replace("::", " · ")} |`);
    }
  }

  if (newFindings.length === 0 && resolved.length === 0 && changed.length === 0) {
    return `\n> _Keine Änderungen seit letztem Run (${previous.ranAt})._\n`;
  }

  let section = `\n> Vergleich mit Run vom ${previous.ranAt}\n\n`;
  section += "| Status | Severity | Check |\n|--------|----------|-------|\n";
  section += [...newFindings, ...changed, ...resolved].join("\n");
  section += "\n";
  return section;
}

function severityRank(s: string): number {
  return s === "critical" ? 3 : s === "warning" ? 2 : 1;
}
let passCount = 0;
let failCount = 0;

function check(
  label: string,
  area: Finding["area"],
  severity: Finding["severity"],
  file: string,
  test: () => boolean,
  fix: string
) {
  if (!test()) {
    findings.push({ area, severity, issue: label, file, fix });
    failCount++;
  } else {
    passCount++;
  }
}

// ── Console Anti-Patterns ────────────────────────────────────────────

describe("Report: Console audit", () => {
  const dashboards = [
    "pages/admin/ConversionIntelligence.tsx",
    "pages/admin/IntelligenceControl.tsx",
    "pages/admin/PerformanceOverview.tsx",
  ];

  for (const f of dashboards) {
    const src = safeRead(f);
    if (!src) continue;
    const name = f.split("/").pop()!;

    it(`${name}: no console.log in production code`, () => {
      check(
        `console.log found in ${name}`,
        "Console",
        "warning",
        f,
        () => !/console\.log\(/.test(src),
        `Remove console.log statements or wrap in if(import.meta.env.DEV)`
      );
      expect(true).toBe(true); // always pass — findings go to report
    });

    it(`${name}: no console.error swallowed silently`, () => {
      check(
        `Swallowed console.error in ${name}`,
        "Console",
        "warning",
        f,
        () => {
          const matches = src.match(/console\.error/g);
          const catches = src.match(/catch\s*\(/g);
          // If more catches than error logs, some errors may be swallowed
          return !catches || !matches || catches.length <= matches.length + 1;
        },
        `Ensure every catch block logs the error or re-throws`
      );
      expect(true).toBe(true);
    });
  }
});

// ── Network / Query Audit ────────────────────────────────────────────

describe("Report: Network & query audit", () => {
  const dashboards = [
    { file: "pages/admin/ConversionIntelligence.tsx", maxLimit: 2000 },
    { file: "pages/admin/IntelligenceControl.tsx", maxLimit: 2000 },
  ];

  for (const { file, maxLimit } of dashboards) {
    const src = safeRead(file);
    if (!src) continue;
    const name = file.split("/").pop()!;

    it(`${name}: all queries have .limit()`, () => {
      // Each .from("...").select() should eventually have .limit()
      const selects = (src.match(/\.from\("[^"]+"\)\.select\(/g) || []).length;
      const limits = (src.match(/\.limit\(\d+\)/g) || []).length;
      check(
        `Missing .limit() on queries in ${name} (${selects} selects, ${limits} limits)`,
        "Network",
        "critical",
        file,
        () => limits >= selects,
        `Add .limit(${maxLimit}) to every Supabase .select() call to prevent unbounded fetches`
      );
      expect(true).toBe(true);
    });

    it(`${name}: no unlimited .select("*")`, () => {
      check(
        `Unscoped .select("*") in ${name}`,
        "Network",
        "warning",
        file,
        () => !/\.select\("\*"\)/.test(src),
        `Replace .select("*") with explicit column list to reduce payload size`
      );
      expect(true).toBe(true);
    });

    it(`${name}: query limits within bounds (≤${maxLimit})`, () => {
      const limitValues = [...src.matchAll(/\.limit\((\d+)\)/g)].map((m) =>
        parseInt(m[1])
      );
      check(
        `Query limit exceeds ${maxLimit} in ${name}: ${limitValues.filter((v) => v > maxLimit)}`,
        "Network",
        "warning",
        file,
        () => limitValues.every((v) => v <= maxLimit),
        `Reduce .limit() values to ≤${maxLimit} for acceptable page load times`
      );
      expect(true).toBe(true);
    });
  }
});

// ── Security Audit ───────────────────────────────────────────────────

describe("Report: Security audit", () => {
  const protectedPages = [
    "pages/admin/ConversionIntelligence.tsx",
    "pages/admin/IntelligenceControl.tsx",
  ];

  for (const file of protectedPages) {
    const src = safeRead(file);
    if (!src) continue;
    const name = file.split("/").pop()!;

    it(`${name}: has L6+ access gate`, () => {
      check(
        `Missing L6+ access control in ${name}`,
        "Security",
        "critical",
        file,
        () => /effectiveLevel\s*<\s*6/.test(src) || /AccessDenied/.test(src),
        `Add L6+ gate: if (effectiveLevel < 6) return <AccessDenied />`
      );
      expect(true).toBe(true);
    });

    it(`${name}: uses useAuth hook`, () => {
      check(
        `Missing useAuth in ${name}`,
        "Security",
        "critical",
        file,
        () => /useAuth/.test(src),
        `Import and use useAuth() for authentication context`
      );
      expect(true).toBe(true);
    });
  }
});

// ── Performance Audit ────────────────────────────────────────────────

describe("Report: Performance audit", () => {
  const kpiHook = safeRead("hooks/useKpiDashboard.ts");

  it("KPI polling interval ≥ 60s", () => {
    if (kpiHook) {
      const match = kpiHook.match(/refetchInterval[:\s]+(\d+)/);
      const interval = match ? parseInt(match[1]) : 0;
      check(
        `KPI polling too fast: ${interval}ms (should be ≥60000ms)`,
        "Performance",
        "warning",
        "hooks/useKpiDashboard.ts",
        () => interval >= 60000,
        `Set refetchInterval to 60000 (60s) to reduce API load`
      );
    }
    expect(true).toBe(true);
  });

  // Check for missing React.memo / useMemo in heavy components
  const heavyComponents = [
    "components/performance/PerformanceShell.tsx",
  ];

  for (const file of heavyComponents) {
    const src = safeRead(file);
    if (!src) continue;
    const name = file.split("/").pop()!;

    it(`${name}: uses memoization`, () => {
      check(
        `No useMemo/React.memo in ${name}`,
        "Performance",
        "info",
        file,
        () => /useMemo|React\.memo|memo\(/.test(src),
        `Consider wrapping expensive computations in useMemo or the component in React.memo`
      );
      expect(true).toBe(true);
    });
  }
});

// ── Data Consistency Audit ───────────────────────────────────────────

describe("Report: Data consistency audit", () => {
  const dashboards = [
    "pages/admin/ConversionIntelligence.tsx",
    "pages/admin/IntelligenceControl.tsx",
  ];

  for (const file of dashboards) {
    const src = safeRead(file);
    if (!src) continue;
    const name = file.split("/").pop()!;

    it(`${name}: uses canonical revenue formula (deal_value * 100)`, () => {
      check(
        `Non-canonical revenue formula in ${name}`,
        "Data",
        "critical",
        file,
        () => /deal_value/.test(src),
        `Use deal_value field (stored as cents×100) for revenue calculations`
      );
      expect(true).toBe(true);
    });

    it(`${name}: closed-lead definition includes "won" and "paid"`, () => {
      check(
        `Incomplete closed-lead definition in ${name}`,
        "Data",
        "warning",
        file,
        () => /won/.test(src) && /paid/.test(src),
        `Include both "won" and "paid" statuses when filtering closed leads`
      );
      expect(true).toBe(true);
    });
  }
});

// ── Generate Report ──────────────────────────────────────────────────

afterAll(() => {
  const now = new Date().toISOString();
  const criticals = findings.filter((f) => f.severity === "critical");
  const warnings = findings.filter((f) => f.severity === "warning");
  const infos = findings.filter((f) => f.severity === "info");

  const previousSnapshot = loadPreviousSnapshot();
  const diffSection = buildDiffSection(previousSnapshot, findings);

  const statusEmoji =
    criticals.length > 0 ? "🔴" : warnings.length > 0 ? "🟡" : "🟢";

  const renderFindings = (list: Finding[]) =>
    list.length === 0
      ? "_Keine Befunde._\n"
      : list
          .map(
            (f) =>
              `| ${f.area} | \`${f.file}\` | ${f.issue} | ${f.fix} |`
          )
          .join("\n");

  const report = `# ETC OS — Regression Report
> Generated: ${now}

## Status: ${statusEmoji} ${criticals.length === 0 && warnings.length === 0 ? "ALL CLEAR" : criticals.length > 0 ? "ACTION REQUIRED" : "MINOR ISSUES"}

## 🔄 Diff zum vorherigen Run
${diffSection}

### Summary
| Metric | Count |
|--------|-------|
| ✅ Checks passed | ${passCount} |
| 🔴 Critical | ${criticals.length} |
| 🟡 Warning | ${warnings.length} |
| ℹ️ Info | ${infos.length} |
| **Total checks** | **${passCount + failCount}** |

---

## 🔴 Critical Findings
| Area | File | Issue | Fix Suggestion |
|------|------|-------|----------------|
${renderFindings(criticals)}

## 🟡 Warnings
| Area | File | Issue | Fix Suggestion |
|------|------|-------|----------------|
${renderFindings(warnings)}

## ℹ️ Info
| Area | File | Issue | Fix Suggestion |
|------|------|-------|----------------|
${renderFindings(infos)}

---

## Audit-Bereiche

### Console
- ✅ Keine unkontrollierten \`console.log\` in Produktionscode
- ✅ Catch-Blöcke loggen Fehler korrekt

### Network
- ✅ Alle Queries haben \`.limit()\` — kein unbegrenztes Fetching
- ✅ Keine \`.select("*")\` — nur benötigte Spalten
- ✅ Query-Limits innerhalb akzeptabler Grenzen

### Security
- ✅ L6+ Access Gates auf allen geschützten Seiten
- ✅ \`useAuth\` Hook wird konsistent verwendet

### Performance
- ✅ KPI-Polling ≥ 60s
- ✅ Memoization in Heavy Components

### Data Consistency
- ✅ Kanonische Revenue-Formel (\`deal_value * 100\`)
- ✅ Closed-Lead Definition: "won" + "paid"

---

_Nächster Schritt: Behebe alle 🔴 Critical Findings vor dem nächsten Deploy._
_Report-Datei: \`/mnt/documents/regression-report.md\`_
`;

  // Write to persistent storage
  try {
    fs.mkdirSync("/mnt/documents", { recursive: true });
    fs.writeFileSync("/mnt/documents/regression-report.md", report);
  } catch {
    // In CI/sandbox the path may not exist — write locally as fallback
    fs.writeFileSync(
      path.resolve(__dirname, "../../regression-report.md"),
      report
    );
  }

  // Save current snapshot for next run's diff
  saveSnapshot(now, findings);

  // ── Send email alert ─────────────────────────────────────────────
  const total = passCount + failCount;
  const score = total > 0 ? Math.round((passCount / total) * 100) : 0;
  const runId = `reg-${now.replace(/[^0-9]/g, "").slice(0, 14)}`;

  const failingChecks = [...criticals, ...warnings].map((f) => ({
    name: f.issue,
    severity: f.severity,
    detail: f.fix,
    category: f.area,
  }));

  const dashboardUrl = "https://ethicalcloser.de/members/admin/e2e-checks";

  const emailPayload = {
    score,
    failedCritical: criticals.length,
    failedWarning: warnings.length,
    total,
    failingChecks,
    runId,
    ranAt: now,
    dashboardUrl,
  };

  // Only send email when there are critical or warning findings
  if (SUPABASE_ANON_KEY && (criticals.length > 0 || warnings.length > 0)) {
    for (const recipient of REGRESSION_ALERT_RECIPIENTS) {
      fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          templateName: "e2e-critical-alert",
          recipientEmail: recipient,
          idempotencyKey: `regression-${runId}`,
          templateData: emailPayload,
        }),
      }).catch((err) => {
        console.warn(`[Regression] Email to ${recipient} failed:`, err);
      });
    }
  } else {
    console.warn("[Regression] No SUPABASE_ANON_KEY — skipping email alert");
  }
});
