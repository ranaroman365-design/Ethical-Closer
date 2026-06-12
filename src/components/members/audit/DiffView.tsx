import { useMemo } from "react";

interface Props {
  before: unknown;
  after: unknown;
}

function toLines(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (typeof v === "string") return v.split("\n");
  try {
    return JSON.stringify(v, null, 2).split("\n");
  } catch {
    return [String(v)];
  }
}

interface DiffRow {
  kind: "same" | "removed" | "added";
  text: string;
}

/** Tiny LCS-based line diff — no external dep. Bounded by line count for safety. */
function diffLines(a: string[], b: string[]): DiffRow[] {
  const MAX = 400;
  if (a.length > MAX || b.length > MAX) {
    // Fallback: just show side-by-side without alignment.
    return [
      ...a.map<DiffRow>((t) => ({ kind: "removed", text: t })),
      ...b.map<DiffRow>((t) => ({ kind: "added", text: t })),
    ];
  }
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffRow[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ kind: "same", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: "removed", text: a[i] }); i++; }
    else { out.push({ kind: "added", text: b[j] }); j++; }
  }
  while (i < m) { out.push({ kind: "removed", text: a[i++] }); }
  while (j < n) { out.push({ kind: "added", text: b[j++] }); }
  return out;
}

export function DiffView({ before, after }: Props) {
  const rows = useMemo(() => diffLines(toLines(before), toLines(after)), [before, after]);
  const hasBefore = before !== null && before !== undefined;
  const hasAfter = after !== null && after !== undefined;

  if (!hasBefore && !hasAfter) {
    return (
      <div className="text-xs text-muted-foreground italic px-3 py-2 rounded-md border border-dashed border-border">
        No state snapshot recorded for this change.
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border bg-muted/20">
      <div className="grid grid-cols-[auto,1fr] text-[12px] font-mono leading-relaxed">
        {rows.map((r, idx) => {
          const prefix = r.kind === "added" ? "+" : r.kind === "removed" ? "−" : " ";
          const rowClass =
            r.kind === "added"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : r.kind === "removed"
              ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : "text-muted-foreground";
          return (
            <div key={idx} className={`contents ${rowClass}`}>
              <div className={`px-2 select-none border-r border-border/40 ${rowClass}`}>{prefix}</div>
              <div className={`px-2 whitespace-pre-wrap break-all ${rowClass}`}>{r.text || " "}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
