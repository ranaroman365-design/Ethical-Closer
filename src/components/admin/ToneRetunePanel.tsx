import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { WHATSAPP_TEMPLATES } from "@/lib/whatsapp-message-library";

type ToneMode = "calm_premium" | "calm_premium_brief";

interface RetuneResult {
  template_key: string;
  original: string;
  proposed: string;
  accepted: boolean;
  violations: string[];
  meta: {
    source_placeholders: string[];
    proposed_placeholders: string[];
    word_count: number;
    word_limit: number;
  };
}

function diffWords(original: string, proposed: string) {
  // Lightweight word-level diff highlight for review (kept minimal — operator decides).
  const o = new Set(original.split(/\s+/));
  const p = proposed.split(/\s+/);
  return p.map((w, i) => {
    const isNew = !o.has(w) && !o.has(w.replace(/[.,!?;:]/g, ""));
    return (
      <span
        key={i}
        className={
          isNew
            ? "bg-emerald-100 text-emerald-900 px-0.5 rounded"
            : "text-stone-800"
        }
      >
        {w}{" "}
      </span>
    );
  });
}

export default function ToneRetunePanel() {
  const [templateKey, setTemplateKey] = useState<string>(
    WHATSAPP_TEMPLATES[0].template_key,
  );
  const [tone, setTone] = useState<ToneMode>("calm_premium");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RetuneResult | null>(null);
  const { toast } = useToast();

  const tpl = useMemo(
    () =>
      WHATSAPP_TEMPLATES.find((t) => t.template_key === templateKey) ??
      WHATSAPP_TEMPLATES[0],
    [templateKey],
  );

  const handleRetune = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "retune-template-tone",
        {
          body: {
            template_key: tpl.template_key,
            source_de: tpl.body.de,
            required_variables: [...tpl.variables],
            optional_variables: [...(tpl.optional_variables ?? [])],
            tone,
          },
        },
      );
      if (error) throw error;
      setResult(data as RetuneResult);
      if (!(data as RetuneResult).accepted) {
        toast({
          title: "Vorschlag abgelehnt",
          description: "Guardrails verletzt — siehe Verstöße unten.",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Retune fehlgeschlagen",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyProposed = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.proposed);
    toast({ title: "Kopiert", description: "Vorschlag in der Zwischenablage." });
  };

  return (
    <Card className="border-stone-200">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <CardTitle className="font-serif text-2xl text-ink">
              Tone Retune (DE) — Layer 48.7
            </CardTitle>
            <p className="text-sm text-stone-600 mt-1 max-w-2xl">
              Ein-Klick-Verfeinerung deutscher Templates Richtung ruhiger,
              hochwertiger Sprache (Apple × Loro Piana). Platzhalter{" "}
              <code className="text-xs bg-stone-100 px-1 rounded">
                {"{{variable}}"}
              </code>{" "}
              werden zwingend erhalten — Verstöße werden serverseitig
              abgewiesen. Der Canon wird NICHT automatisch geändert: prüfe und
              kopiere den Vorschlag manuell ins Library-File.
            </p>
          </div>
          <Badge variant="outline" className="bg-stone-50">
            advisory · no auto-mutation
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-stone-600 uppercase tracking-wide">
              Template
            </label>
            <Select value={templateKey} onValueChange={setTemplateKey}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WHATSAPP_TEMPLATES.map((t) => (
                  <SelectItem key={t.template_key} value={t.template_key}>
                    {t.template_key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-stone-600 uppercase tracking-wide">
              Modus
            </label>
            <Select value={tone} onValueChange={(v) => setTone(v as ToneMode)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="calm_premium">
                  Calm & Premium (≤60 Wörter)
                </SelectItem>
                <SelectItem value="calm_premium_brief">
                  Calm & Premium · sehr knapp (≤35 Wörter)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleRetune} disabled={loading} className="w-full">
              {loading ? "Verfeinere…" : "✨ Tone Retune"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-stone-600 uppercase tracking-wide">
              Original (DE)
            </label>
            <pre className="mt-1 text-sm whitespace-pre-wrap font-sans bg-stone-50 p-3 rounded border border-stone-200 leading-relaxed min-h-[120px]">
              {tpl.body.de}
            </pre>
            <p className="text-[10px] text-stone-500 mt-1">
              Pflicht: {tpl.variables.length === 0 ? "—" :
                tpl.variables.map((v) => `{{${v}}}`).join(", ")}
            </p>
          </div>
          <div>
            <label className="text-xs text-stone-600 uppercase tracking-wide">
              Vorschlag (DE){" "}
              {result && (
                <Badge
                  className={
                    result.accepted
                      ? "ml-2 bg-emerald-100 text-emerald-900"
                      : "ml-2 bg-red-100 text-red-900"
                  }
                >
                  {result.accepted ? "✓ akzeptiert" : "⚠ abgelehnt"}
                </Badge>
              )}
            </label>
            <pre className="mt-1 text-sm whitespace-pre-wrap font-sans bg-cream p-3 rounded border border-stone-200 leading-relaxed min-h-[120px]">
              {result ? diffWords(result.original, result.proposed) : (
                <span className="text-stone-400">— noch kein Vorschlag —</span>
              )}
            </pre>
            {result && (
              <div className="flex items-center gap-3 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyProposed}
                  disabled={!result.accepted}
                >
                  📋 Vorschlag kopieren
                </Button>
                <span className="text-[10px] text-stone-500">
                  {result.meta.word_count}/{result.meta.word_limit} Wörter ·
                  Platzhalter:{" "}
                  {result.meta.proposed_placeholders.length === 0
                    ? "—"
                    : result.meta.proposed_placeholders
                        .map((v) => `{{${v}}}`)
                        .join(", ")}
                </span>
              </div>
            )}
          </div>
        </div>

        {result && result.violations.length > 0 && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-3">
            <p className="text-xs font-medium text-red-900 mb-2">
              Guardrail-Verstöße
            </p>
            <ul className="text-xs text-red-800 list-disc pl-5 space-y-1">
              {result.violations.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="border border-stone-200 rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead>Guardrail</TableHead>
                <TableHead>Regel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="text-xs">Platzhalter-Erhalt</TableCell>
                <TableCell className="text-xs text-stone-600">
                  Set + Anzahl müssen exakt gleich bleiben. Neue Platzhalter
                  werden abgewiesen.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs">Wortlimit</TableCell>
                <TableCell className="text-xs text-stone-600">
                  60 Wörter (calm_premium) bzw. 35 (brief).
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs">Verbotene Phrasen</TableCell>
                <TableCell className="text-xs text-stone-600">
                  garantiert · passives einkommen · schnell reich · über nacht ·
                  exklusiv für dich · limited time · jetzt zuschlagen · sichere
                  dir · mega · krass · wahnsinn · 100% · risikofrei
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs">Auto-mutation</TableCell>
                <TableCell className="text-xs text-stone-600">
                  Aus. Operator entscheidet. Vorschlag muss manuell in{" "}
                  <code className="text-[10px] bg-stone-100 px-1 rounded">
                    src/lib/whatsapp-message-library.ts
                  </code>{" "}
                  gepasted werden.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
