import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIAnalysis {
  motivation: number;
  clarity: number;
  commitment: number;
  recommendation: "closable" | "needs_call" | "not_ready";
  summary: string;
}

interface AiSetterChatProps {
  leadId?: string;
  onComplete?: (analysis: AIAnalysis) => void;
}

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content:
    "Bevor dein Gespräch stattfindet, klären wir 3 Dinge:\n\n• dein Ziel\n• deine Situation\n• ob das hier wirklich passt\n\nStarten wir: **Was ist dein Hauptziel — warum bist du hier?**",
};

function parseAnalysis(text: string): AIAnalysis | null {
  const match = text.match(/\[AI_ANALYSIS\]([\s\S]*?)\[\/AI_ANALYSIS\]/);
  if (!match) return null;
  const block = match[1];
  const get = (key: string) => {
    const m = block.match(new RegExp(`${key}:\\s*(.+)`));
    return m ? m[1].trim() : "";
  };
  return {
    motivation: parseInt(get("motivation")) || 0,
    clarity: parseInt(get("clarity")) || 0,
    commitment: parseInt(get("commitment")) || 0,
    recommendation: (get("recommendation") as AIAnalysis["recommendation"]) || "needs_call",
    summary: get("summary"),
  };
}

function stripAnalysis(text: string): string {
  return text.replace(/\[AI_ANALYSIS\][\s\S]*?\[\/AI_ANALYSIS\]/, "").trim();
}

export default function AiSetterChat({ leadId, onComplete }: AiSetterChatProps) {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setIsLoading(true);

    let assistantText = "";

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-setter`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error("No stream body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const updateAssistant = (content: string) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && prev.length > allMessages.length) {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
          }
          return [...prev, { role: "assistant", content }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              updateAssistant(stripAnalysis(assistantText));
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Check for analysis block
      const parsed = parseAnalysis(assistantText);
      if (parsed) {
        setAnalysis(parsed);
        onComplete?.(parsed);

        // Persist to DB
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("ai_setter_sessions").insert({
            lead_id: leadId || null,
            user_id: user.id,
            session_status: "completed",
            messages_json: [...allMessages, { role: "assistant", content: stripAnalysis(assistantText) }],
            motivation_score: parsed.motivation,
            clarity_score: parsed.clarity,
            commitment_score: parsed.commitment,
            overall_ai_score: Math.round((parsed.motivation + parsed.clarity + parsed.commitment) / 3),
            ai_recommendation: parsed.recommendation,
            summary_text: parsed.summary,
            chat_completed: true,
          } as any);
        }
      }
    } catch (e: any) {
      console.error("AI Setter error:", e);
      toast({
        title: "Fehler",
        description: e.message || "Bitte versuche es erneut.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, messages, leadId, onComplete, toast]);

  return (
    <div className="flex flex-col h-[500px] rounded-xl border border-border/40 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-muted/30">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">AI Vorbereitung</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pre-Call Qualification</p>
        </div>
        {analysis && (
          <div className="ml-auto flex items-center gap-1.5 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <span className="text-green-600 font-medium">Abgeschlossen</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex gap-2.5 max-w-[85%]",
                msg.role === "user" ? "ml-auto flex-row-reverse" : ""
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  msg.role === "assistant" ? "bg-primary/10" : "bg-accent/10"
                )}
              >
                {msg.role === "assistant" ? (
                  <Bot className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <User className="h-3.5 w-3.5 text-accent" />
                )}
              </div>
              <div
                className={cn(
                  "rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.role === "assistant"
                    ? "bg-muted/50 text-foreground"
                    : "bg-primary text-primary-foreground"
                )}
              >
                {msg.content.split("\n").map((line, j) => (
                  <span key={j}>
                    {line.replace(/\*\*(.*?)\*\*/g, "$1")}
                    {j < msg.content.split("\n").length - 1 && <br />}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <div className="flex gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="rounded-lg px-3.5 py-2.5 bg-muted/50">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Analysis result */}
      {analysis && (
        <div className="px-4 py-3 border-t border-border/30 bg-muted/20">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Motivation:</span>{" "}
              <span className="font-semibold">{analysis.motivation}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Klarheit:</span>{" "}
              <span className="font-semibold">{analysis.clarity}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Commitment:</span>{" "}
              <span className="font-semibold">{analysis.commitment}</span>
            </div>
            <div className="ml-auto">
              {analysis.recommendation === "closable" && (
                <span className="text-green-600 font-semibold">Bereit</span>
              )}
              {analysis.recommendation === "needs_call" && (
                <span className="text-amber-600 font-semibold">Call empfohlen</span>
              )}
              {analysis.recommendation === "not_ready" && (
                <span className="text-red-500 font-semibold">Noch nicht bereit</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      {!analysis && (
        <div className="px-4 py-3 border-t border-border/30">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Deine Antwort..."
              disabled={isLoading}
              className="flex-1 rounded-lg border border-border/40 bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
