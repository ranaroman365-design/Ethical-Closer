import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  WHATSAPP_TEMPLATES,
  getABTestedTemplates,
  getAllVariants,
} from "@/lib/whatsapp-message-library";

interface Row {
  event_key: string;
  template_key: string;
  variant_key: string;
  sent_count: number;
  conversions: number;
  hard_conversions: number;
  total_value_eur: number;
  conversion_rate_pct: number;
  hard_conversion_rate_pct: number;
  last_sent_at: string | null;
}

const MIN_SAMPLE = 30; // below this, declare "insufficient data"

function declareWinner(rows: Row[]) {
  if (rows.length < 2) return null;
  const enough = rows.filter((r) => r.sent_count >= MIN_SAMPLE);
  if (enough.length < 2) return { status: "insufficient_data" as const };
  const sorted = [...enough].sort(
    (a, b) => b.hard_conversion_rate_pct - a.hard_conversion_rate_pct,
  );
  const top = sorted[0];
  const next = sorted[1];
  const lift = top.hard_conversion_rate_pct - next.hard_conversion_rate_pct;
  if (lift >= 2) {
    return {
      status: "winner_ready" as const,
      winner: top.variant_key,
      lift_pct: lift,
    };
  }
  return { status: "running" as const };
}

export default function ABTestPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("v_communication_ab_leaderboard" as any)
        .select("*")
        .order("sent_count", { ascending: false });
      if (!error && data) setRows(data as unknown as Row[]);
      setLoading(false);
    })();
  }, []);

  const tested = useMemo(() => getABTestedTemplates(), []);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = map.get(r.template_key) ?? [];
      arr.push(r);
      map.set(r.template_key, arr);
    }
    return map;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl text-ink">
          A/B Variants —{" "}
          <span className="text-stone-500">
            {tested.length} active tests
          </span>
        </h2>
        <p className="text-sm text-stone-600 mt-1">
          Per template + variant: messages sent, conversions, and conversion
          rate. Winner declared at ≥{MIN_SAMPLE} sends/variant + ≥2pp lift on
          hard conversion (booking/show/close).
        </p>
      </div>

      {loading ? (
        <p className="text-stone-500">Lade…</p>
      ) : tested.length === 0 ? (
        <p className="text-stone-500">Noch keine A/B-Tests konfiguriert.</p>
      ) : (
        tested.map((tpl) => {
          const variantDefs = getAllVariants(tpl);
          const dataRows = grouped.get(tpl.template_key) ?? [];
          // Ensure every defined variant appears, even with 0 sends
          const merged: Row[] = variantDefs.map((v) => {
            const found = dataRows.find((r) => r.variant_key === v.variant_id);
            return (
              found ?? {
                event_key: tpl.event_key,
                template_key: tpl.template_key,
                variant_key: v.variant_id,
                sent_count: 0,
                conversions: 0,
                hard_conversions: 0,
                total_value_eur: 0,
                conversion_rate_pct: 0,
                hard_conversion_rate_pct: 0,
                last_sent_at: null,
              }
            );
          });
          const verdict = declareWinner(merged);

          return (
            <Card key={tpl.template_key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm">{tpl.template_key}</span>
                  <Badge variant="outline">{tpl.event_key}</Badge>
                  {verdict?.status === "winner_ready" && (
                    <Badge className="bg-green-100 text-green-900">
                      Winner: {verdict.winner} (+
                      {verdict.lift_pct.toFixed(1)}pp)
                    </Badge>
                  )}
                  {verdict?.status === "insufficient_data" && (
                    <Badge className="bg-stone-200 text-stone-800">
                      insufficient data (need ≥{MIN_SAMPLE}/variant)
                    </Badge>
                  )}
                  {verdict?.status === "running" && (
                    <Badge className="bg-blue-100 text-blue-900">
                      running — no significant lift yet
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variant</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Conv.</TableHead>
                      <TableHead className="text-right">Hard</TableHead>
                      <TableHead className="text-right">Conv. %</TableHead>
                      <TableHead className="text-right">Hard %</TableHead>
                      <TableHead className="text-right">Value €</TableHead>
                      <TableHead>Letzte Sendung</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {merged.map((r) => {
                      const def = variantDefs.find(
                        (v) => v.variant_id === r.variant_key,
                      );
                      const isWinner =
                        verdict?.status === "winner_ready" &&
                        verdict.winner === r.variant_key;
                      return (
                        <TableRow
                          key={r.variant_key}
                          className={isWinner ? "bg-green-50" : ""}
                        >
                          <TableCell className="font-mono text-xs">
                            {r.variant_key}
                            {def?.label && (
                              <span className="ml-2 text-[11px] text-stone-500">
                                {def.label}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.sent_count}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.conversions}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.hard_conversions}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.conversion_rate_pct}%
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {r.hard_conversion_rate_pct}%
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(r.total_value_eur).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs text-stone-500">
                            {r.last_sent_at
                              ? new Date(r.last_sent_at).toLocaleString()
                              : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All templates — A/B status</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="text-right">Variants</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {WHATSAPP_TEMPLATES.map((t) => {
                const all = getAllVariants(t);
                return (
                  <TableRow key={t.template_key}>
                    <TableCell className="font-mono text-xs">
                      {t.template_key}
                    </TableCell>
                    <TableCell className="text-xs">{t.event_key}</TableCell>
                    <TableCell className="text-right">{all.length}</TableCell>
                    <TableCell>
                      {all.length > 1 ? (
                        <Badge className="bg-blue-100 text-blue-900">
                          A/B active
                        </Badge>
                      ) : (
                        <Badge variant="outline">single</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
