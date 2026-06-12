import { useMemo } from "react";
import { ChangeCard, type ChangeCardData } from "./ChangeCard";

interface Props {
  changes: ChangeCardData[];
  onRollback?: (changeId: string, reason: string) => Promise<void> | void;
  canRollback?: boolean;
  busy?: boolean;
}

function bucketLabel(d: Date): string {
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.floor((startOfDay(today) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  if (diffDays < 30) return "This month";
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function Timeline({ changes, onRollback, canRollback, busy }: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, ChangeCardData[]>();
    const order: string[] = [];
    for (const c of changes) {
      const label = bucketLabel(new Date(c.created_at));
      if (!map.has(label)) { map.set(label, []); order.push(label); }
      map.get(label)!.push(c);
    }
    return order.map((label) => ({ label, items: map.get(label)! }));
  }, [changes]);

  if (changes.length === 0) {
    return (
      <div className="text-muted-foreground p-10 text-center border border-dashed border-border rounded-2xl">
        No changes recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.label} className="space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {g.label}
            </h3>
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">{g.items.length}</span>
          </div>
          <div className="relative pl-6 space-y-3 border-l border-border">
            {g.items.map((c) => (
              <div key={c.change_id} className="relative">
                <span className="absolute -left-[1.6rem] top-5 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-background" />
                <ChangeCard change={c} onRollback={onRollback} canRollback={canRollback} busy={busy} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
