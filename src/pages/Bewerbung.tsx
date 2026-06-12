import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import MicroCommitments from "@/components/landing/MicroCommitments";
import { Loader2 } from "lucide-react";
import { persistLeadVerdict, routeForVerdict, generateBookingToken } from "@/lib/lead-storage";
import { captureCurrentPageAttribution, getCurrentAttributionSessionId, linkCurrentLeadAttribution } from "@/lib/lead-attribution";

const situationOptions = ["Angestellt", "Selbstständig", "Zwischenphase", "Student/in"];
const hoursOptions = ["5–10 Stunden", "10–20 Stunden", "20+ Stunden"];
const performanceOptions = ["Ja", "Unsicher", "Nein"];
const commSkillOptions = ["1", "2", "3", "4", "5"];
const ethicalOptions = [
  { id: "performance", label: "Ergebnis & Performance", desc: "Ich glaube, dass ehrliche Beratung langfristig zu besseren Ergebnissen führt – höhere Abschlussquoten, weniger Stornos und dadurch stabilere Einnahmen." },
  { id: "helping", label: "Menschen wirklich helfen", desc: "Mich motiviert die Vorstellung, Menschen wirklich bei wichtigen Entscheidungen zu begleiten und zu sehen, wie sie durch die richtige Lösung vorankommen." },
  { id: "community", label: "Community & Umfeld", desc: "Ich finde es attraktiv, mit Menschen zusammenzuarbeiten, die ähnlich denken – eine Community aufzubauen, die sich gegenseitig unterstützt statt gegeneinander zu arbeiten." },
  { id: "advisor", label: "Rolle als Berater statt Verkäufer", desc: "Ich sehe die Rolle eines Closers eher als vertrauensvollen Berater oder Broker, der Menschen hilft, die richtige nächste Stufe zu erreichen – nicht als jemanden, der einfach etwas verkauft." },
];

const Bewerbung = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [situation, setSituation] = useState("");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState("");
  const [performanceBased, setPerformanceBased] = useState("");
  const [commSkill, setCommSkill] = useState("");
  const [ethicalValues, setEthicalValues] = useState<string[]>([]);
  const [goal, setGoal] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [commitments, setCommitments] = useState([false, false, false]);

  useEffect(() => {
    captureCurrentPageAttribution("Bewerbung");
  }, []);

  const toggleEthical = (id: string) => {
    setEthicalValues(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const canProceed = () => {
    switch (step) {
      case 0: return !!situation;
      case 1: return reason.trim().length > 0;
      case 2: return ethicalValues.length > 0;
      case 3: return !!hours;
      case 4: return !!performanceBased;
      case 5: return !!commSkill;
      case 6: return goal.trim().length > 0;
      case 7: return name.trim().length > 0 && email.trim().length > 0 && phone.trim().length > 0 && commitments.every(Boolean);
      default: return true;
    }
  };

  const handleSubmit = async () => {
    if (submitted || submitting) return;
    setSubmitting(true);

    try {
      const quizFunnel = localStorage.getItem('quiz_funnel') || null;

      const quizAnswers = {
        situation,
        reason,
        ethicalValues,
        hours,
        performanceBased,
        commSkill,
        goal,
        linkedin: linkedin || null,
      };

      const { resolveFunnelSource, getCachedTrafficOwner } = await import("@/lib/funnel-source");
      // Use the SECURITY DEFINER RPC to bypass RLS
      const { data, error } = await supabase.rpc("upsert_funnel_lead", {
        p_name: name.trim(),
        p_email: email.trim(),
        p_phone: phone.trim() || null,
        p_funnel_source: resolveFunnelSource(),
        p_quiz_answers: quizAnswers,
        p_session_id: getCurrentAttributionSessionId(),
        p_traffic_owner: getCachedTrafficOwner(),
      } as never);

      if (error) {
        console.error("Bewerbung submit error:", error);
        toast({
          title: "Fehler beim Absenden",
          description: "Deine Angaben konnten gerade nicht gespeichert werden. Bitte prüfe deine Eingaben oder versuche es erneut.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      const result = data as { success?: boolean; lead_id?: string; error?: string } | null;
      if (result?.error) {
        console.error("Bewerbung upsert error:", result.error);
        toast({
          title: "Fehler",
          description: result.error,
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      // Link quiz submission to lead
      const quizSubmissionId = localStorage.getItem('quiz_submission_id');
      if (quizSubmissionId && result?.lead_id) {
        supabase.from('quiz_submissions').update({
          lead_id: result.lead_id,
          email: email.trim().toLowerCase(),
        } as any).eq('id', quizSubmissionId).then(({ error: linkErr }) => {
          if (linkErr) console.error('Quiz link error:', linkErr);
        });
      }

      // Fire analytics event
      window.dispatchEvent(new CustomEvent("analytics", {
        detail: {
          event: "qualification_submit",
          data: { situation, reason, ethicalValues, hours, performanceBased, commSkill, goal, linkedin, name, email, phone }
        }
      }));

      // Mirror server verdict (incl. updated qualification on retake) into
      // localStorage and route based on the FRESH server verdict, not on
      // stale low-bucket data.
      const verdict = persistLeadVerdict(data, {
        name: name,
        email: email,
        phone: phone,
      });
      await linkCurrentLeadAttribution(verdict.leadId, email);
      localStorage.setItem("quiz_completed_at", new Date().toISOString());
      localStorage.setItem("quiz_funnel", quizFunnel || "bewerbung");

      // Generate booking continuation token
      let tokenParam = "";
      if (verdict.leadId && verdict.qualificationBucket !== "low" && verdict.leadQuality !== "C") {
        const token = await generateBookingToken(verdict.leadId);
        if (token) tokenParam = `?token=${encodeURIComponent(token)}`;
      }

      setSubmitted(true);
      toast({
        title: "Bewerbung eingegangen ✓",
        description: "Wir melden uns innerhalb von 24 Stunden bei dir.",
      });
      navigate(
        routeForVerdict(verdict, {
          defaultPath: `/booking${tokenParam}`,
          lowPath: "/quiz/low-result",
        }),
      );
    } catch (err: any) {
      console.error('Bewerbung submit error:', err);
      toast({
        title: "Fehler beim Absenden",
        description: "Deine Angaben konnten gerade nicht gespeichert werden. Bitte prüfe deine Eingaben oder versuche es erneut.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full rounded-sm border border-border bg-background px-4 py-3 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  const optionButton = (selected: boolean) =>
    `w-full rounded-sm border px-5 py-3 text-left font-sans text-sm transition-colors ${
      selected
        ? "border-primary bg-primary/5 text-foreground"
        : "border-border bg-background text-muted-foreground hover:border-primary/50"
    }`;

  const totalQuestions = 8;
  const questions = [
    {
      label: `Frage 1 von ${totalQuestions}`,
      question: "Was ist deine aktuelle berufliche Situation?",
      input: (
        <div className="space-y-3">
          {situationOptions.map((opt) => (
            <button key={opt} onClick={() => setSituation(opt)} className={optionButton(situation === opt)}>{opt}</button>
          ))}
        </div>
      ),
    },
    {
      label: `Frage 2 von ${totalQuestions}`,
      question: "Warum möchtest du vom klassischen 9–5-Modell weg?",
      input: (
        <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} placeholder="Beschreibe kurz deine Motivation …" maxLength={500} className={`${inputClass} min-h-[120px] resize-none`} />
      ),
    },
    {
      label: `Frage 3 von ${totalQuestions}`,
      question: "Welche Aussage beschreibt am besten, warum dich ethisches High-Ticket Closing besonders anspricht?",
      input: (
        <div className="space-y-4">
          <p className="font-sans text-xs text-muted-foreground">Wähle alle Optionen, die auf dich zutreffen.</p>
          {ethicalOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => toggleEthical(opt.id)}
              className={`w-full rounded-sm border px-5 py-4 text-left transition-colors ${
                ethicalValues.includes(opt.id)
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:border-primary/50"
              }`}
            >
              <span className="block font-sans text-sm font-medium text-foreground">{opt.label}</span>
              <span className="mt-1 block font-sans text-xs leading-relaxed text-muted-foreground">{opt.desc}</span>
            </button>
          ))}
        </div>
      ),
    },
    {
      label: `Frage 4 von ${totalQuestions}`,
      question: "Wie viele Stunden pro Woche kannst du realistisch investieren?",
      input: (
        <div className="space-y-3">
          {hoursOptions.map((opt) => (
            <button key={opt} onClick={() => setHours(opt)} className={optionButton(hours === opt)}>{opt}</button>
          ))}
        </div>
      ),
    },
    {
      label: `Frage 5 von ${totalQuestions}`,
      question: "Bist du bereit, leistungsbasiert statt fix vergütet zu arbeiten?",
      input: (
        <div className="space-y-3">
          {performanceOptions.map((opt) => (
            <button key={opt} onClick={() => setPerformanceBased(opt)} className={optionButton(performanceBased === opt)}>{opt}</button>
          ))}
        </div>
      ),
    },
    {
      label: `Frage 6 von ${totalQuestions}`,
      question: "Wie würdest du deine Kommunikationsstärke einschätzen?",
      input: (
        <div className="flex justify-center gap-3">
          {commSkillOptions.map((opt) => (
            <button key={opt} onClick={() => setCommSkill(opt)} className={`flex h-12 w-12 items-center justify-center rounded-sm border font-sans text-sm font-medium transition-colors ${commSkill === opt ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/50"}`}>{opt}</button>
          ))}
        </div>
      ),
    },
    {
      label: `Frage 7 von ${totalQuestions}`,
      question: "Was ist dein primäres Ziel in den nächsten 6 Monaten?",
      input: (
        <div className="space-y-4">
          <textarea value={goal} onChange={(e) => setGoal(e.target.value.slice(0, 500))} placeholder="Beschreibe dein Ziel …" maxLength={500} className={`${inputClass} min-h-[120px] resize-none`} />
          <div>
            <label className="mb-2 block font-sans text-xs text-muted-foreground">LinkedIn-Profil (optional)</label>
            <input type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value.slice(0, 255))} placeholder="https://linkedin.com/in/..." maxLength={255} className={inputClass} />
          </div>
        </div>
      ),
    },
    {
      label: `Frage 8 von ${totalQuestions}`,
      question: "Fast geschafft – wie können wir dich erreichen?",
      input: (
        <div className="space-y-4">
          <div>
            <label className="mb-2 block font-sans text-xs text-muted-foreground">Vollständiger Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 100))} placeholder="Max Mustermann" maxLength={100} className={inputClass} />
          </div>
          <div>
            <label className="mb-2 block font-sans text-xs text-muted-foreground">E-Mail-Adresse *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value.slice(0, 255))} placeholder="max@beispiel.de" maxLength={255} className={inputClass} />
          </div>
          <div>
            <label className="mb-2 block font-sans text-xs text-muted-foreground">Telefonnummer *</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 30))} placeholder="+49 170 1234567" maxLength={30} className={inputClass} />
          </div>
          <div className="mt-6 border-t border-border/40 pt-6">
            <p className="mb-4 font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dein Commitment</p>
            <MicroCommitments
              commitments={commitments}
              onChange={(i, checked) => setCommitments(prev => prev.map((c, idx) => idx === i ? checked : c))}
            />
          </div>
        </div>
      ),
    },
  ];

  const current = questions[step];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-lg py-16 md:py-24">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-8">
            <div className="h-1 w-full overflow-hidden rounded-full bg-border">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((step + 1) / questions.length) * 100}%` }} />
            </div>
            <p className="mt-3 font-sans text-xs text-muted-foreground">{current.label}</p>
          </div>

          <h2 className="mb-8 font-serif text-2xl font-semibold text-foreground">{current.question}</h2>
          {current.input}

          <div className="mt-10 flex justify-between">
            {step > 0 ? (
              <button onClick={() => setStep(step - 1)} className="font-sans text-sm text-muted-foreground transition-colors hover:text-foreground">← Zurück</button>
            ) : <div />}

            {step < questions.length - 1 ? (
              <button onClick={() => canProceed() && setStep(step + 1)} disabled={!canProceed()} className="rounded-sm bg-primary px-8 py-3 font-sans text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40">Weiter</button>
            ) : (
              <button onClick={handleSubmit} disabled={!canProceed() || submitting} className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-3 font-sans text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Wird gesendet…
                  </>
                ) : "Bewerbung absenden"}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Bewerbung;
