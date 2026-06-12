import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  renderWhatsAppTemplate,
} from "@/lib/whatsapp-message-library";
import {
  validateTemplateVariables,
  buildAutoFilledContext,
  type SuggestionConfidence,
} from "@/lib/variable-suggestions";

const CONFIDENCE_COLOR: Record<SuggestionConfidence, string> = {
  high: "bg-emerald-100 text-emerald-900",
  medium: "bg-amber-100 text-amber-900",
  low: "bg-yellow-100 text-yellow-900",
  manual: "bg-red-100 text-red-900",
};

const SAMPLE_CONTEXT = {
  name: "Alex",
  email: "alex@example.com",
  score: 16,
  income_goal: "12k/Monat",
};

export default function VariableValidationPanel() {
  const [templateKey, setTemplateKey] = useState<string>(
    WHATSAPP_TEMPLATES[0].template_key,
  );
  const [lang, setLang] = useState<"de" | "en">("de");
  const [contextRaw, setContextRaw] = useState<string>(
    JSON.stringify(SAMPLE_CONTEXT, null, 2),
  );

  const { context, parseError } = useMemo(() => {
    try {
      const parsed = contextRaw.trim() ? JSON.parse(contextRaw) : {};
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { context: {}, parseError: "Context must be a JSON object." };
      }
      return { context: parsed as Record<string, unknown>, parseError: null };
    } catch (e) {
      return {
        context: {},
        parseError: (e as Error).message,
      };
    }
  }, [contextRaw]);

  const tpl = useMemo(
    () =>
      WHATSAPP_TEMPLATES.find((t) => t.template_key === templateKey) ??
      WHATSAPP_TEMPLATES[0],
    [templateKey],
  );

  const validation = useMemo(
    () =>
      validateTemplateVariables({
        template_key: tpl.template_key,
        required: tpl.variables,
        optional: tpl.optional_variables ?? [],
        context,
      }),
    [tpl, context],
  );

  const autoFilled = useMemo(
    () =>
      buildAutoFilledContext(tpl.variables, tpl.optional_variables ?? [], context),
    [tpl, context],
  );

  const rendered = useMemo(
    () => renderWhatsAppTemplate(tpl.template_key, autoFilled, lang),
    [tpl, autoFilled, lang],
  );

  // Highlight {{vars}} in source body.
  const highlightedBody = useMemo(() => {
    const src = tpl.body[lang];
    const parts = src.split(/(\{\{[a-z_][a-z0-9_]*\}\})/gi);
    return parts.map((p, i) => {
      const match = /^\{\{([a-z_][a-z0-9_]*)\}\}$/i.exec(p);
      if (!match) return <span key={i}>{p}</span>;
      const v = match[1];
      const isRequired = tpl.variables.includes(v);
      const supplied =
        context[v] !== undefined && context[v] !== null && context[v] !== "";
      const sug = validation.suggestions.find((s) => s.variable === v);
      const cls = supplied
        ? "bg-emerald-100 text-emerald-900"
        : isRequired
          ? sug?.confidence === "manual"
            ? "bg-red-100 text-red-900"
            : "bg-amber-100 text-amber-900"
          : "bg-stone-100 text-stone-700";
      return (
        <TooltipProvider key={i} delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`px-1 rounded font-mono text-[11px] mx-0.5 cursor-help ${cls}`}
              >
                {p}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="text-xs">
                <div className="font-medium">{v}</div>
                <div className="text-stone-600 mt-1">
                  {supplied
                    ? `Supplied: "${String(context[v])}"`
                    : sug?.suggested_value
                      ? `Suggested: "${sug.suggested_value}" (${sug.confidence})`
                      : "Manual entry required"}
                </div>
                <div className="text-stone-500 mt-1">{sug?.rationale}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    });
  }, [tpl, lang, context, validation]);

  return (
    <Card className="border-stone-200">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <CardTitle className="font-serif text-2xl text-ink">
              Variable Validation — Layer 48.6
            </CardTitle>
            <p className="text-sm text-stone-600 mt-1 max-w-2xl">
              Scan any template against a lead context. Missing{" "}
              <code className="text-xs bg-stone-100 px-1 rounded">
                {"{{variables}}"}
              </code>{" "}
              are highlighted with suggested values{" "}
              <span className="text-emerald-700">before</span> dispatch — never
              after. Auto-fillable vars come from the canonical link map and
              heuristic defaults; personal data must come from the lead.
            </p>
          </div>
          <Badge
            className={
              validation.ready_to_send
                ? "bg-emerald-100 text-emerald-900"
                : "bg-red-100 text-red-900"
            }
          >
            {validation.ready_to_send ? "✓ Ready to send" : "⚠ Manual input needed"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Controls */}
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
              Language
            </label>
            <Select value={lang} onValueChange={(v) => setLang(v as "de" | "en")}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="de">DE</SelectItem>
                <SelectItem value="en">EN</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setContextRaw(JSON.stringify(SAMPLE_CONTEXT, null, 2))
              }
            >
              Reset sample context
            </Button>
          </div>
        </div>

        <div>
          <label className="text-xs text-stone-600 uppercase tracking-wide">
            Lead context (JSON)
          </label>
          <Textarea
            value={contextRaw}
            onChange={(e) => setContextRaw(e.target.value)}
            rows={6}
            className="mt-1 font-mono text-xs"
            spellCheck={false}
          />
          {parseError && (
            <p className="text-xs text-red-700 mt-1">JSON error: {parseError}</p>
          )}
        </div>

        {/* Source body with highlighted variables */}
        <div>
          <label className="text-xs text-stone-600 uppercase tracking-wide">
            Source body (variables highlighted)
          </label>
          <pre className="mt-1 text-sm whitespace-pre-wrap font-sans bg-stone-50 p-3 rounded border border-stone-200 leading-relaxed">
            {highlightedBody}
          </pre>
        </div>

        {/* Variable table */}
        <div className="border border-stone-200 rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead>Variable</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Suggested value</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {validation.suggestions.map((s) => {
                const isRequired = tpl.variables.includes(s.variable);
                const supplied =
                  context[s.variable] !== undefined &&
                  context[s.variable] !== null &&
                  context[s.variable] !== "";
                return (
                  <TableRow key={s.variable}>
                    <TableCell>
                      <span className="font-mono text-xs">
                        {`{{${s.variable}}}`}
                      </span>
                      {isRequired ? (
                        <Badge className="ml-2 bg-stone-200 text-stone-800 text-[10px]">
                          required
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="ml-2 text-[10px] text-stone-500"
                        >
                          optional
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {supplied ? (
                        <Badge className="bg-emerald-100 text-emerald-900">
                          ✓ supplied
                        </Badge>
                      ) : s.suggested_value ? (
                        <Badge className="bg-amber-100 text-amber-900">
                          auto-fill
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-900">
                          missing
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {supplied
                        ? String(context[s.variable])
                        : s.suggested_value ?? (
                            <span className="text-red-700">— manual —</span>
                          )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`${CONFIDENCE_COLOR[s.confidence]} text-[10px]`}
                      >
                        {s.confidence}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-stone-600">
                      <TooltipProvider delayDuration={120}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted">
                              {s.source}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs">{s.rationale}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Final preview */}
        <div>
          <label className="text-xs text-stone-600 uppercase tracking-wide">
            Final preview (with auto-fills applied)
          </label>
          <pre className="mt-1 text-sm whitespace-pre-wrap font-sans bg-cream p-3 rounded border border-stone-200">
            {rendered?.body ?? "—"}
          </pre>
          {rendered?.missing_variables.length ? (
            <p className="text-xs text-red-700 mt-2">
              Still missing required: {rendered.missing_variables.join(", ")}.
              Dispatch will be rejected by the renderer.
            </p>
          ) : (
            <p className="text-xs text-emerald-700 mt-2">
              All required variables resolved. Safe to dispatch.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
