/**
 * Layer 48.2 UI — Humanizer Preview
 *
 * L6+ playground for the humanize-message Edge Function. Lets operators feed a
 * synthetic lead context, pick an event_key from the WhatsApp library, and
 * inspect the 4-part contextual output before we wire it into live sends.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { WHATSAPP_TEMPLATES, TONE_LABEL, type MessageTone } from "@/lib/whatsapp-message-library";

type ToneHint = "high_performer" | "uncertain" | "slow_responder" | "neutral";
type Channel = "whatsapp" | "sms" | "email";

interface HumanizedResult {
  message: {
    anchor: string;
    mirroring: string;
    orientation: string;
    action: string;
    body: string;
    subject: string;
    channel: Channel;
    tone_used: ToneHint;
    datum_referenced: string;
  };
  meta: {
    word_count: number;
    subject_word_count: number;
    word_limit: number;
    hard_word_cap: number;
    channel: Channel;
    model: string;
    event_key: string;
    lang: "de" | "en";
    violations: string[];
    generated_at: string;
  };
}

const CHANNEL_HINT: Record<Channel, string> = {
  whatsapp: "Conversational · ≤ 60 words · line breaks ok",
  sms: "Ultra short · ≤ 30 words · single block · no emoji",
  email: "Documentation · ≤ 120 words · subject + greeting + sign-off",
};

export default function HumanizerPanel() {
  const [eventKey, setEventKey] = useState<string>(WHATSAPP_TEMPLATES[1].event_key);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [lang, setLang] = useState<"de" | "en">("de");
  const [name, setName] = useState("Alex");
  const [incomeGoal, setIncomeGoal] = useState("10k/Monat");
  const [score, setScore] = useState("14");
  const [funnelStage, setFunnelStage] = useState("QUIZ");
  const [toneHint, setToneHint] = useState<ToneHint>("neutral");
  const [quizJson, setQuizJson] = useState(
    `{"experience":"none","time_per_week":"15h","reason":"income shift"}`,
  );
  const [bookingLink, setBookingLink] = useState("https://etc.de/buchen");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HumanizedResult | null>(null);
  const [editedBody, setEditedBody] = useState<string>("");
  const [editedSubject, setEditedSubject] = useState<string>("");
  const [edited, setEdited] = useState(false);

  const selectedTpl = WHATSAPP_TEMPLATES.find((t) => t.event_key === eventKey);

  // Mirror the Edge Function's hard rules (Layer 48.2 multi-channel)
  const BANNED = /(garantiert|risikofrei|jetzt zuschlagen|mega|krass|exklusiv jetzt|sofort reich|passive[s]? einkommen|guaranteed|risk[- ]?free|act now|insane|crazy)/gi;
  const EMOJI = /[\p{Extended_Pictographic}]/u;
  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const editedWords = editedBody ? wordCount(editedBody) : 0;
  const editedSubjectWords = editedSubject ? wordCount(editedSubject) : 0;
  const editedViolations = editedBody ? Array.from(new Set(editedBody.match(BANNED) ?? [])) : [];
  const hardCap = result?.meta.hard_word_cap ?? 70;
  const overLimit = editedWords > hardCap;
  const smsLineBreakViolation = channel === "sms" && /\n/.test(editedBody);
  const smsEmojiViolation = channel === "sms" && EMOJI.test(editedBody);
  const emailSubjectMissing = channel === "email" && (!editedSubject || editedSubject.trim().length === 0);
  const emailSubjectTooLong = channel === "email" && editedSubjectWords > 8;

  const generate = async () => {
    setLoading(true);
    setResult(null);
    let quiz: Record<string, unknown> = {};
    try {
      quiz = quizJson ? JSON.parse(quizJson) : {};
    } catch {
      toast.error("Quiz answers must be valid JSON.");
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.functions.invoke("humanize-message", {
      body: {
        event_key: eventKey,
        channel,
        lang,
        name: name || undefined,
        income_goal: incomeGoal || null,
        lead_score: score ? Number(score) : null,
        funnel_stage: funnelStage || null,
        tone_hint: toneHint,
        quiz_answers: quiz,
        booking_link: bookingLink || undefined,
      },
    });
    setLoading(false);
    if (error || !data?.ok) {
      toast.error(data?.error ?? error?.message ?? "Generation failed");
      return;
    }
    setResult(data as HumanizedResult);
    setEditedBody((data as HumanizedResult).message.body);
    setEditedSubject((data as HumanizedResult).message.subject ?? "");
    setEdited(false);
    if ((data as HumanizedResult).meta.violations.length > 0) {
      toast.warning(`Guardrail violations: ${(data as HumanizedResult).meta.violations.join(", ")}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-2xl text-ink">Humanized Message Generator</CardTitle>
        <p className="text-sm text-stone-600 mt-1">
          Layer 48.2 · Multi-channel — Same 4-part relationship structure (Anchor → Mirroring →
          Orientation → Action) across WhatsApp, SMS and Email. Only delivery format adapts
          (length, line breaks, subject line). Canonical templates remain the deterministic fallback.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase tracking-wide text-stone-500">Event</label>
            <Select value={eventKey} onValueChange={setEventKey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                {WHATSAPP_TEMPLATES.map((t) => (
                  <SelectItem key={t.template_key} value={t.event_key}>
                    {t.template_key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTpl && (
              <p className="text-[10px] text-stone-500 mt-1">
                Canonical tone: <Badge variant="outline" className="text-[10px]">{TONE_LABEL[selectedTpl.tone as MessageTone]}</Badge>
              </p>
            )}
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-stone-500">Channel</label>
            <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-stone-500 mt-1">{CHANNEL_HINT[channel]}</p>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-stone-500">Language</label>
            <Select value={lang} onValueChange={(v) => setLang(v as "de" | "en")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="de">DE</SelectItem>
                <SelectItem value="en">EN</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-stone-500">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-stone-500">Income goal</label>
            <Input value={incomeGoal} onChange={(e) => setIncomeGoal(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-stone-500">Lead score (0–18)</label>
            <Input type="number" value={score} onChange={(e) => setScore(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-stone-500">Funnel stage</label>
            <Input value={funnelStage} onChange={(e) => setFunnelStage(e.target.value)} placeholder="LEAD / QUIZ / BOOKED / NO_SHOW" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-stone-500">Tone hint</label>
            <Select value={toneHint} onValueChange={(v) => setToneHint(v as ToneHint)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="high_performer">High performer (direct)</SelectItem>
                <SelectItem value="uncertain">Uncertain (softer)</SelectItem>
                <SelectItem value="slow_responder">Slow responder (ultra short)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-stone-500">Booking link</label>
            <Input value={bookingLink} onChange={(e) => setBookingLink(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wide text-stone-500">Quiz answers (JSON)</label>
          <Textarea
            rows={3}
            value={quizJson}
            onChange={(e) => setQuizJson(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={generate} disabled={loading}>
            {loading ? "Generating…" : "Generate humanized message"}
          </Button>
        </div>

        {/* Output */}
        {result && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs uppercase tracking-wide text-stone-500">
                  Final {result.message.channel} body
                  {edited && <span className="ml-1 text-amber-600 normal-case tracking-normal">· edited</span>}
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    disabled={!edited}
                    onClick={() => {
                      setEditedBody(result.message.body);
                      setEditedSubject(result.message.subject ?? "");
                      setEdited(false);
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={async () => {
                      const payload =
                        result.message.channel === "email" && editedSubject
                          ? `Subject: ${editedSubject}\n\n${editedBody}`
                          : editedBody;
                      await navigator.clipboard.writeText(payload);
                      toast.success("Copied to clipboard");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>

              {result.message.channel === "email" && (
                <div className="mb-2">
                  <label className="text-[10px] uppercase tracking-wide text-stone-500">
                    Subject ({editedSubjectWords}/8 words)
                  </label>
                  <Input
                    value={editedSubject}
                    onChange={(e) => {
                      setEditedSubject(e.target.value);
                      setEdited(
                        e.target.value !== (result.message.subject ?? "") ||
                          editedBody !== result.message.body,
                      );
                    }}
                    className="text-sm"
                  />
                </div>
              )}

              <Textarea
                rows={result.message.channel === "email" ? 8 : result.message.channel === "sms" ? 3 : 6}
                value={editedBody}
                onChange={(e) => {
                  setEditedBody(e.target.value);
                  setEdited(
                    e.target.value !== result.message.body ||
                      editedSubject !== (result.message.subject ?? ""),
                  );
                }}
                className="text-sm font-sans bg-stone-50 border-stone-200"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="outline" className="text-[10px]">channel: {result.message.channel}</Badge>
                <Badge variant="outline" className="text-[10px]">tone: {result.message.tone_used}</Badge>
                <Badge
                  variant={overLimit ? "destructive" : "outline"}
                  className="text-[10px]"
                >
                  words: {editedWords}/{result.meta.word_limit}
                  {edited ? ` · orig ${result.meta.word_count}` : ""}
                  {overLimit ? ` · over ${hardCap}` : ""}
                </Badge>
                <Badge variant="outline" className="text-[10px]">anchor: {result.message.datum_referenced || "—"}</Badge>
                {editedViolations.length > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    banned: {editedViolations.join(", ")}
                  </Badge>
                )}
                {smsLineBreakViolation && (
                  <Badge variant="destructive" className="text-[10px]">SMS · no line breaks</Badge>
                )}
                {smsEmojiViolation && (
                  <Badge variant="destructive" className="text-[10px]">SMS · no emoji</Badge>
                )}
                {emailSubjectMissing && (
                  <Badge variant="destructive" className="text-[10px]">email · subject missing</Badge>
                )}
                {emailSubjectTooLong && (
                  <Badge variant="destructive" className="text-[10px]">email · subject &gt; 8 words</Badge>
                )}
                {result.meta.violations.length > 0 && !edited && (
                  <Badge variant="destructive" className="text-[10px]">
                    server: {result.meta.violations.join(", ")}
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-stone-500 mt-1">
                Same 4-part relationship tone — only delivery format changes per channel. Edits stay
                local; canon is never mutated.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-500 mb-1">4-part breakdown</p>
              <div className="space-y-2 text-sm">
                <div><span className="text-[10px] uppercase tracking-wide text-stone-500 mr-2">Anchor</span>{result.message.anchor}</div>
                <div><span className="text-[10px] uppercase tracking-wide text-stone-500 mr-2">Mirroring</span>{result.message.mirroring}</div>
                <div><span className="text-[10px] uppercase tracking-wide text-stone-500 mr-2">Orientation</span>{result.message.orientation}</div>
                <div><span className="text-[10px] uppercase tracking-wide text-stone-500 mr-2">Action</span>{result.message.action}</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
