import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  CONVERSATION_TREE,
  LEAD_STATES,
  BRANCH_COPY,
  detectLeadState,
  resolveBranch,
  renderBranchCopy,
  type LeadState,
  type ReplySpeed,
} from "@/lib/conversation-trees";

const STATE_COLOR: Record<LeadState, string> = {
  interested: "bg-green-100 text-green-900",
  curious: "bg-blue-100 text-blue-900",
  hesitant: "bg-yellow-100 text-yellow-900",
  resistant: "bg-orange-100 text-orange-900",
  silent: "bg-stone-200 text-stone-800",
};

export default function ConversationTreePanel() {
  const [text, setText] = useState("Vielleicht. Wie läuft das ab?");
  const [speed, setSpeed] = useState<ReplySpeed>("normal");
  const [stage, setStage] = useState<0 | 1 | 2>(1);
  const [lang, setLang] = useState<"de" | "en">("de");
  const [firstName, setFirstName] = useState("Max");
  const [goal, setGoal] = useState("8.000€/Monat");
  const [bookingLink, setBookingLink] = useState("https://cal.example/abc");

  const detected = useMemo<LeadState>(
    () => detectLeadState({ text }),
    [text],
  );

  const result = useMemo(
    () => resolveBranch({ state: detected, speed, follow_up_stage: stage }),
    [detected, speed, stage],
  );

  const rendered = useMemo(
    () =>
      renderBranchCopy(
        result.template_key,
        {
          first_name: firstName,
          goal,
          booking_link: result.emit_booking_link ? bookingLink : undefined,
        },
        lang,
      ),
    [result, firstName, goal, bookingLink, lang],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl text-ink">
          Conversation Trees{" "}
          <span className="text-xs text-stone-500">(Layer 48.3)</span>
        </h2>
        <p className="text-sm text-stone-600 mt-1">
          Deterministische Verzweigung: 5 Lead-States → 1 Branch → 1 Ziel. Keine
          Skripte, keine Wiederholung, kein Druck.
        </p>
      </div>

      {/* Tree overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tree-Übersicht</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>State</TableHead>
                <TableHead>Goal</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Next Action</TableHead>
                <TableHead>Tone</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LEAD_STATES.map((s) => {
                const b = CONVERSATION_TREE[s];
                return (
                  <TableRow key={s}>
                    <TableCell>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${STATE_COLOR[s]}`}
                      >
                        {s}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{b.goal}</TableCell>
                    <TableCell className="text-xs font-mono">
                      {b.template_key}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {b.next_action}
                    </TableCell>
                    <TableCell className="text-xs">{b.tone}</TableCell>
                    <TableCell className="text-xs text-stone-600">
                      {b.notes}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Live simulator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branch-Simulator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>User-Antwort (Text)</Label>
              <Input value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Speed</Label>
                <Select
                  value={speed}
                  onValueChange={(v) => setSpeed(v as ReplySpeed)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fast">fast</SelectItem>
                    <SelectItem value="normal">normal</SelectItem>
                    <SelectItem value="slow">slow</SelectItem>
                    <SelectItem value="none">none</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Silent stage</Label>
                <Select
                  value={String(stage)}
                  onValueChange={(v) => setStage(Number(v) as 0 | 1 | 2)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0</SelectItem>
                    <SelectItem value="1">1 (2–4h)</SelectItem>
                    <SelectItem value="2">2 (24h)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sprache</Label>
                <Select
                  value={lang}
                  onValueChange={(v) => setLang(v as "de" | "en")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="de">DE</SelectItem>
                    <SelectItem value="en">EN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>first_name</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <Label>goal</Label>
              <Input value={goal} onChange={(e) => setGoal(e.target.value)} />
            </div>
            <div>
              <Label>booking_link</Label>
              <Input
                value={bookingLink}
                onChange={(e) => setBookingLink(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 items-center">
            <Badge className={STATE_COLOR[detected]}>
              detected: {detected}
            </Badge>
            <Badge variant="outline">tone: {result.tone}</Badge>
            <Badge variant="outline">action: {result.next_action}</Badge>
            {result.emit_booking_link && (
              <Badge className="bg-green-100 text-green-900">
                booking link emitted
              </Badge>
            )}
          </div>

          <div>
            <Label className="text-xs text-stone-500">Rationale</Label>
            <p className="text-xs text-stone-700">{result.rationale}</p>
          </div>

          <div>
            <Label className="text-xs text-stone-500">
              Rendered message ({result.template_key})
            </Label>
            <pre className="text-sm whitespace-pre-wrap font-sans bg-stone-50 p-3 rounded border border-stone-200">
              {rendered.body || "(empty — missing required vars)"}
            </pre>
            {rendered.missing_variables.length > 0 && (
              <p className="text-xs text-red-700 mt-1">
                Missing: {rendered.missing_variables.join(", ")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Branch copy library preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branch Copy Library</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>DE</TableHead>
                <TableHead>EN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(BRANCH_COPY).map(([key, tpl]) => (
                <TableRow key={key}>
                  <TableCell className="font-mono text-xs align-top whitespace-nowrap">
                    {key}
                  </TableCell>
                  <TableCell>
                    <pre className="text-xs whitespace-pre-wrap font-sans bg-stone-50 p-2 rounded border border-stone-200">
                      {tpl.de}
                    </pre>
                  </TableCell>
                  <TableCell>
                    <pre className="text-xs whitespace-pre-wrap font-sans bg-stone-50 p-2 rounded border border-stone-200">
                      {tpl.en}
                    </pre>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
