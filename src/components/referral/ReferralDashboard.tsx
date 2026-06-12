import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check, Users, TrendingUp, Wallet, Clock, Gift, AlertTriangle, ShieldX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReferralSummary {
  total_referrals: number;
  current_tier: number;
  reward_per_deal: number;
  pending_amount: number;
  eligible_amount: number;
  paid_amount: number;
  reversed_amount: number;
}

const TIER_CONFIG = {
  1: { label: "Tier 1", range: "1–2 Referrals", reward: "€200", color: "bg-blue-100 text-blue-800" },
  2: { label: "Tier 2", range: "3–4 Referrals", reward: "€350", color: "bg-purple-100 text-purple-800" },
  3: { label: "Tier 3", range: "5+ Referrals", reward: "€500", color: "bg-amber-100 text-amber-800" },
};

export default function ReferralDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    loadData();
  }, [user?.id]);

  async function loadData() {
    if (!user?.id) return;
    setLoading(true);

    const { data: linkData } = await supabase
      .from("referral_links")
      .select("referral_code")
      .eq("user_id", user.id)
      .maybeSingle();

    if (linkData) {
      setReferralCode(linkData.referral_code);
    } else {
      const code = `ref-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
      const { data: newLink } = await supabase
        .from("referral_links")
        .insert({ user_id: user.id, referral_code: code })
        .select("referral_code")
        .single();
      if (newLink) setReferralCode(newLink.referral_code);
    }

    const { data: summaryData } = await supabase.rpc("get_referral_summary", {
      p_user_id: user.id,
    });
    if (summaryData && summaryData.length > 0) {
      setSummary(summaryData[0] as unknown as ReferralSummary);
    }

    setLoading(false);
  }

  const referralUrl = referralCode
    ? `${window.location.origin}/apply?ref=${referralCode}`
    : "";

  function handleCopy() {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    toast({ title: "Link kopiert!", description: "Dein Referral-Link wurde kopiert." });
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Lade Referral-Daten...
        </CardContent>
      </Card>
    );
  }

  const tier = summary?.current_tier ?? 1;
  const tierCfg = TIER_CONFIG[tier as keyof typeof TIER_CONFIG];
  const nextTier = tier < 3 ? TIER_CONFIG[(tier + 1) as keyof typeof TIER_CONFIG] : null;

  return (
    <div className="space-y-6">
      {/* Referral Link */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gift className="h-5 w-5" />
            Dein Referral-Link
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm truncate">
              {referralUrl}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Teile diesen Link — für jeden abgeschlossenen Deal erhältst du eine Prämie.
          </p>
        </CardContent>
      </Card>

      {/* Tier + Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Badge className={`mb-2 ${tierCfg.color}`}>{tierCfg.label}</Badge>
            <p className="text-2xl font-bold">{tierCfg.reward}</p>
            <p className="text-xs text-muted-foreground">pro Deal · {tierCfg.range}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col items-center">
            <Users className="h-5 w-5 text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{summary?.total_referrals ?? 0}</p>
            <p className="text-xs text-muted-foreground">Referrals gesamt</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col items-center">
            <Clock className="h-5 w-5 text-amber-500 mb-1" />
            <p className="text-2xl font-bold">€{summary?.pending_amount?.toFixed(0) ?? "0"}</p>
            <p className="text-xs text-muted-foreground">Ausstehend (14-Tage Lock)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col items-center">
            <Wallet className="h-5 w-5 text-green-600 mb-1" />
            <p className="text-2xl font-bold">€{summary?.eligible_amount?.toFixed(0) ?? "0"}</p>
            <p className="text-xs text-muted-foreground">Auszahlbar</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col items-center">
            <ShieldX className="h-5 w-5 text-destructive mb-1" />
            <p className="text-2xl font-bold">€{summary?.reversed_amount?.toFixed(0) ?? "0"}</p>
            <p className="text-xs text-muted-foreground">Storniert</p>
          </CardContent>
        </Card>
      </div>

      {/* Paid total */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span className="font-medium">Bereits ausgezahlt</span>
          </div>
          <span className="text-xl font-bold">€{summary?.paid_amount?.toFixed(0) ?? "0"}</span>
        </CardContent>
      </Card>

      {/* Tier Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tier-Übersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(TIER_CONFIG).map(([t, cfg]) => (
              <div
                key={t}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                  Number(t) === tier ? "bg-primary/10 font-semibold" : "opacity-60"
                }`}
              >
                <span>{cfg.label} — {cfg.range}</span>
                <span>{cfg.reward} / Deal</span>
              </div>
            ))}
          </div>
          {nextTier && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Noch {tier === 1 ? "1 weitere(r)" : "1 weitere(r)"} Abschluss bis {nextTier.label} ({nextTier.reward}/Deal)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
