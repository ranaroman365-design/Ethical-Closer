import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  MOS_PROOFS_QUERY_KEY,
  useMosProofImages,
  type MosProofAsset,
} from "@/hooks/useMosProofImages";
import PlatformProofSlot from "@/components/masterofsales/PlatformProofSlot";
import { toast } from "@/hooks/use-toast";

/**
 * Canonical slot inventory — keep in sync with the four LP proof blocks.
 * slot_key = the route (stable identifier used by PlatformProofSlot).
 */
type SlotDef = {
  sections: string[];
  label: string;
  route: string;
  caption: string;
};

// One entry per unique route. Sections array reflects which LP block(s) reuse it.
const SLOTS: SlotDef[] = [
  { sections: ["Real Platform Preview", "How progression looks inside ETC™"], label: "Career Path™", route: "/members/career-path", caption: "L0 → L8 · Placement Ready™ · Placed Closer™ · Top Performer™." },
  { sections: ["Real Platform Preview"], label: "Performance Dashboard™", route: "/members/performance", caption: "Level · KPIs · Fortschritt · Performance — alles in einem Blick." },
  { sections: ["Real Platform Preview", "AI Differentiation"], label: "AI Closing Assistant™", route: "/members/ai-copilot", caption: "Live-Copilot · Echtzeit-Guidance · Coaching im Gespräch." },
  { sections: ["How progression looks inside ETC™"], label: "KPI Verification", route: "/members/performance/intelligence", caption: "Verifizierte Leistungsdaten statt Selbstauskunft." },
  { sections: ["How progression looks inside ETC™"], label: "Placement", route: "/members/placement", caption: "Placement Ready™ → Placement Qualified™ → Placed Closer™." },
  { sections: ["AI Differentiation"], label: "Simulator", route: "/members/simulator", caption: "Verkaufsgespräche trainieren — bevor du mit echten Leads sprichst." },
  { sections: ["AI Differentiation"], label: "Ethical Simulator", route: "/members/simulator/ethical", caption: "Einwände & Drucksituationen — sauber, ohne Manipulation." },
];

const BUCKET = "masterofsales-proofs";

const MasterOfSalesProofsAdmin = () => {
  const qc = useQueryClient();
  const { data: registry, isLoading } = useMosProofImages();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, SlotDef[]>();
    for (const s of SLOTS) {
      for (const section of s.sections) {
        const arr = map.get(section) ?? [];
        arr.push(s);
        map.set(section, arr);
      }
    }
    return Array.from(map.entries());
  }, []);

  const filledCount = useMemo(
    () => SLOTS.filter((s) => registry?.has(s.route)).length,
    [registry],
  );

  const handleUpload = async (slot: SlotDef, file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Ungültiger Dateityp", description: "Bitte ein Bild (PNG/JPG/WebP) hochladen.", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Datei zu groß", description: "Max. 8 MB pro Screenshot.", variant: "destructive" });
      return;
    }
    setBusyKey(slot.route);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const safeKey = slot.route.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
      const path = `${safeKey}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const imageUrl = pub.publicUrl;

      const existing = registry?.get(slot.route);

      const { error: dbErr } = await supabase
        .from("masterofsales_proof_assets")
        .upsert(
          {
            slot_key: slot.route,
            image_url: imageUrl,
            storage_path: path,
            alt_text: `${slot.label} — echte Plattform-Ansicht aus ${slot.route}`,
            updated_at: new Date().toISOString(),
            updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
          },
          { onConflict: "slot_key" },
        );
      if (dbErr) throw dbErr;

      // Best-effort: remove the previous file to keep the bucket tidy.
      if (existing?.storage_path && existing.storage_path !== path) {
        await supabase.storage.from(BUCKET).remove([existing.storage_path]);
      }

      await qc.invalidateQueries({ queryKey: MOS_PROOFS_QUERY_KEY });
      toast({ title: "Screenshot live", description: `${slot.label} ist jetzt auf /masterofsales sichtbar.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unbekannter Fehler";
      toast({ title: "Upload fehlgeschlagen", description: msg, variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemove = async (slot: SlotDef, asset: MosProofAsset) => {
    if (!confirm(`Screenshot für „${slot.label}“ entfernen?`)) return;
    setBusyKey(slot.route);
    try {
      const { error: dbErr } = await supabase
        .from("masterofsales_proof_assets")
        .delete()
        .eq("slot_key", slot.route);
      if (dbErr) throw dbErr;
      if (asset.storage_path) {
        await supabase.storage.from(BUCKET).remove([asset.storage_path]);
      }
      await qc.invalidateQueries({ queryKey: MOS_PROOFS_QUERY_KEY });
      toast({ title: "Entfernt", description: `${slot.label} zeigt wieder den Empty-State.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unbekannter Fehler";
      toast({ title: "Entfernen fehlgeschlagen", description: msg, variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-12 md:px-10 md:py-16">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-foreground/10 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-accent">
              Master of Sales™ · Proof Console
            </p>
            <h1 className="mt-3 font-serif text-3xl leading-tight md:text-4xl">
              Plattform-Screenshots verwalten
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/65">
              Pro Slot einen echten Screenshot hochladen. Sichtbar sofort auf{" "}
              <Link to="/masterofsales" className="underline decoration-accent/40 underline-offset-4 hover:text-foreground">
                /masterofsales
              </Link>
              . Keine Mockups, keine erfundenen Kennzahlen.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 md:items-end">
            <div className="font-serif text-3xl text-foreground">
              {filledCount}<span className="text-foreground/40">/{SLOTS.length}</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-foreground/50">
              Slots befüllt
            </div>
          </div>
        </div>

        {/* Sections */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-foreground/50">Lade Registry…</div>
        ) : (
          <div className="mt-10 space-y-14">
            {grouped.map(([section, slots]) => (
              <section key={section}>
                <h2 className="mb-6 font-serif text-xl text-foreground/85 md:text-2xl">
                  {section}
                </h2>
                <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
                  {slots.map((slot) => (
                    <SlotEditor
                      key={slot.route}
                      slot={slot}
                      asset={registry?.get(slot.route)}
                      busy={busyKey === slot.route}
                      onUpload={(f) => handleUpload(slot, f)}
                      onRemove={(asset) => handleRemove(slot, asset)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Per-slot editor card
// ---------------------------------------------------------------------------

const SlotEditor = ({
  slot,
  asset,
  busy,
  onUpload,
  onRemove,
}: {
  slot: SlotDef;
  asset?: MosProofAsset;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: (asset: MosProofAsset) => void;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const hasAsset = !!asset;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-5">
      {/* Live preview — exact LP rendering */}
      <PlatformProofSlot
        label={slot.label}
        route={slot.route}
        caption={slot.caption}
      />

      {/* Meta */}
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em]">
        <span className={hasAsset ? "text-emerald-500" : "text-foreground/40"}>
          {hasAsset ? "● Live" : "○ Empty-State"}
        </span>
        {asset ? (
          <span className="font-mono text-foreground/40 normal-case tracking-normal">
            {new Date(asset.updated_at).toLocaleDateString("de-DE")}
          </span>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-xs uppercase tracking-[0.15em] text-foreground transition hover:bg-accent/20 disabled:opacity-50"
        >
          {busy ? "Lade hoch…" : hasAsset ? "Ersetzen" : "Hochladen"}
        </button>
        {hasAsset ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(asset!)}
            className="inline-flex items-center rounded-xl border border-foreground/15 px-4 py-2 text-xs uppercase tracking-[0.15em] text-foreground/70 transition hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
          >
            Entfernen
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default MasterOfSalesProofsAdmin;
