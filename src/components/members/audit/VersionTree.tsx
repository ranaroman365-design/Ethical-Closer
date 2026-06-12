import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotateCcw } from "lucide-react";

export interface VersionNode {
  version_id: string;
  parent_version_id: string | null;
  module: string;
  scope_type: string;
  scope_id: string | null;
  active: boolean;
  reason: string | null;
  created_at: string;
}

interface Props {
  versions: VersionNode[];
  onRestore?: (versionId: string, reason: string) => Promise<void> | void;
  busy?: boolean;
}

interface Group {
  key: string;
  module: string;
  scope_type: string;
  scope_id: string | null;
  versions: VersionNode[];
}

export function VersionTree({ versions, onRestore, busy }: Props) {
  const [restoreReason, setRestoreReason] = useState<Record<string, string>>({});

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const v of versions) {
      const key = `${v.module}|${v.scope_type}|${v.scope_id ?? "_"}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          module: v.module,
          scope_type: v.scope_type,
          scope_id: v.scope_id,
          versions: [],
        });
      }
      map.get(key)!.versions.push(v);
    }
    return Array.from(map.values()).map((g) => ({
      ...g,
      versions: g.versions.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    }));
  }, [versions]);

  if (versions.length === 0) {
    return (
      <div className="text-muted-foreground p-10 text-center border border-dashed border-border rounded-2xl">
        No version snapshots yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.key} className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{g.module.replace(/_/g, " ")}</Badge>
            <Badge variant="outline">{g.scope_type}{g.scope_id ? `:${g.scope_id.slice(0, 8)}` : ""}</Badge>
            <span className="ml-auto text-xs text-muted-foreground">{g.versions.length} versions</span>
          </div>

          <div className="space-y-2">
            {g.versions.map((v, idx) => {
              const versionLabel = `v${g.versions.length - idx}`;
              return (
                <div
                  key={v.version_id}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-2 ${
                    v.active ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="text-sm font-mono font-medium w-12">{versionLabel}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {v.active && <Badge>ACTIVE</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString()}
                      </span>
                    </div>
                    {v.reason && <p className="text-sm mt-1">{v.reason}</p>}
                    <p className="text-[10px] text-muted-foreground font-mono mt-1 truncate">
                      {v.version_id}
                    </p>
                  </div>
                  {!v.active && onRestore && (
                    <div className="flex gap-2 items-end">
                      <Input
                        value={restoreReason[v.version_id] ?? ""}
                        onChange={(e) =>
                          setRestoreReason((r) => ({ ...r, [v.version_id]: e.target.value }))
                        }
                        placeholder="Rollback reason"
                        className="h-8 w-48 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !(restoreReason[v.version_id] ?? "").trim()}
                        onClick={async () => {
                          await onRestore(v.version_id, (restoreReason[v.version_id] ?? "").trim());
                          setRestoreReason((r) => ({ ...r, [v.version_id]: "" }));
                        }}
                        className="gap-1"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restore
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
