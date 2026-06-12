import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PRODUCT } from '@/config/product';
import { Check, ChevronRight, ChevronLeft, Rocket, Briefcase, Users, Zap } from 'lucide-react';

const THEME_PRESETS = [
  { key: 'default', label: 'Default / Professional', desc: 'Dunkel, elegant, seriös' },
  { key: 'income', label: 'Income', desc: 'Dark & Gold — Premium-Feeling' },
  { key: 'lifestyle', label: 'Lifestyle', desc: 'Hell, weich, einladend' },
  { key: 'identity', label: 'Identity', desc: 'Clean, minimal, modern' },
];

const KPI_OPTIONS = [
  { key: 'show_rate', label: 'Show Rate' },
  { key: 'close_rate', label: 'Close Rate' },
  { key: 'earnings_per_call', label: 'Earnings per Call' },
  { key: 'calls', label: 'Calls' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'lead_to_booking_rate', label: 'Lead Response Time' },
  { key: 'follow_up_rate', label: 'Follow-Up Rate' },
  { key: 'contact_rate', label: 'CRM Quality Score' },
  { key: 'speed_to_lead', label: 'Show-Up Volume' },
  { key: 'qualification_accuracy', label: 'Pipeline Conversion Rate' },
];

const DEFAULT_LEVELS: Array<{ level: number; key: string; de: string; en: string; role: string | null }> = PRODUCT.career.levels.map(l => ({
  level: l.level as number, key: l.key as string, de: l.de as string, en: l.en as string, role: l.role as string | null,
}));

const DEFAULT_COMMISSION_RATES: Record<string, { role: string; rate: number; label: string }> = {
  opener: { role: 'opener', rate: 0.01, label: '1% Opener' },
  setter: { role: 'setter', rate: 0.03, label: '3% Setter' },
  senior_associate: { role: 'setter', rate: 0.05, label: '5% Senior Setter' },
  junior_manager: { role: 'closer', rate: 0.08, label: '8% Closer (Placement Track)' },
  manager: { role: 'closer', rate: 0.10, label: '10% Managing Closer' },
  senior_manager: { role: 'closer', rate: 0.12, label: '12% Senior Closer' },
};

const DEFAULT_LEAD_TYPES = [
  { key: 'identity', label: 'Identity', description: 'Persönlichkeitsentwicklung', active: true },
  { key: 'lifestyle', label: 'Lifestyle', description: 'Lebensgestaltung', active: true },
  { key: 'income', label: 'Income', description: 'Einkommensoptimierung', active: true },
];

/* ─── TEMPLATES ─── */
interface ProductTemplate {
  key: string;
  label: string;
  desc: string;
  icon: React.ComponentType<any>;
  theme: string;
  kpis: string[];
  commissions: Record<string, { role: string; rate: number; label: string }>;
  leadTypes: Array<{ key: string; label: string; description: string; active: boolean }>;
}

const TEMPLATES: ProductTemplate[] = [
  {
    key: 'sales_academy',
    label: 'Sales Academy',
    desc: 'Ausbildungsprogramm mit vollem Karrierepfad, Zertifizierungen und Community.',
    icon: Briefcase,
    theme: 'default',
    kpis: ['show_rate', 'close_rate', 'calls', 'revenue', 'earnings_per_call', 'follow_up_rate'],
    commissions: DEFAULT_COMMISSION_RATES,
    leadTypes: DEFAULT_LEAD_TYPES,
  },
  {
    key: 'internal_team',
    label: 'Internal Sales Team',
    desc: 'Internes Vertriebsteam mit Fokus auf KPI-Tracking und Performance.',
    icon: Users,
    theme: 'income',
    kpis: ['show_rate', 'close_rate', 'calls', 'revenue', 'contact_rate', 'speed_to_lead'],
    commissions: {
      opener: { role: 'opener', rate: 0, label: '0% (Festgehalt)' },
      setter: { role: 'setter', rate: 0.02, label: '2% Setter Bonus' },
      junior_manager: { role: 'closer', rate: 0.05, label: '5% Closer Bonus' },
      manager: { role: 'closer', rate: 0.07, label: '7% Senior Bonus' },
    },
    leadTypes: [
      { key: 'b2b', label: 'B2B', description: 'Geschäftskunden', active: true },
      { key: 'enterprise', label: 'Enterprise', description: 'Großkunden', active: true },
      { key: 'smb', label: 'SMB', description: 'Kleine & mittelständische Unternehmen', active: true },
    ],
  },
  {
    key: 'partner_engine',
    label: 'Partner Sales Engine',
    desc: 'Partner-Netzwerk mit Referral-System und Revenue-Share.',
    icon: Zap,
    theme: 'lifestyle',
    kpis: ['show_rate', 'close_rate', 'revenue', 'earnings_per_call', 'qualification_accuracy'],
    commissions: {
      setter: { role: 'setter', rate: 0.04, label: '4% Setter' },
      junior_manager: { role: 'closer', rate: 0.10, label: '10% Closer' },
      manager: { role: 'closer', rate: 0.15, label: '15% Senior Closer' },
    },
    leadTypes: [
      { key: 'referral', label: 'Referral', description: 'Empfehlungs-Leads', active: true },
      { key: 'high_ticket', label: 'High Ticket', description: 'Premium-Kunden', active: true },
      { key: 'partner', label: 'Partner', description: 'Partner-Akquise', active: true },
    ],
  },
];

export default function ProductSetupWizard() {
  const [step, setStep] = useState(0); // 0 = template selection
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Step 1: Branding
  const [productName, setProductName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [themeKey, setThemeKey] = useState('default');

  // Step 2: KPIs
  const [kpis, setKpis] = useState<Record<string, boolean>>(
    Object.fromEntries(KPI_OPTIONS.map(k => [k.key, ['show_rate', 'close_rate', 'calls', 'revenue', 'earnings_per_call', 'follow_up_rate'].includes(k.key)]))
  );

  // Step 3: Commissions
  const [commissions, setCommissions] = useState(DEFAULT_COMMISSION_RATES);

  // Step 4: Level names
  const [levels, setLevels] = useState(DEFAULT_LEVELS);

  // Step 5: Lead types
  const [leadTypes, setLeadTypes] = useState(DEFAULT_LEAD_TYPES);
  const [newLeadKey, setNewLeadKey] = useState('');
  const [newLeadLabel, setNewLeadLabel] = useState('');

  const productKey = productName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20) || 'new_product';

  const applyTemplate = (templateKey: string) => {
    const tpl = TEMPLATES.find(t => t.key === templateKey);
    if (!tpl) return;
    setSelectedTemplate(templateKey);
    setThemeKey(tpl.theme);
    setKpis(Object.fromEntries(KPI_OPTIONS.map(k => [k.key, tpl.kpis.includes(k.key)])));
    setCommissions({ ...DEFAULT_COMMISSION_RATES, ...tpl.commissions });
    setLeadTypes(tpl.leadTypes);
    setStep(1);
  };

  const handleCreate = async () => {
    if (!productName.trim()) { toast.error('Produktname erforderlich'); return; }
    setCreating(true);
    try {
      const communityMapping: Record<string, string> = {};
      levels.forEach(l => {
        if (l.level <= 1) communityMapping[l.key] = 'trainee';
        else if (l.level <= 3) communityMapping[l.key] = 'setter';
        else if (l.level <= 6) communityMapping[l.key] = 'closer';
        else communityMapping[l.key] = 'manager';
      });

      const config = {
        branding: { product_name: productName, brand_name: brandName || productName, logo_url: null, theme_key: themeKey },
        kpi_toggles: kpis,
        commission_rates: commissions,
        levels,
        lead_types: leadTypes,
        community_mapping: communityMapping,
        promotion_thresholds: {
          "1": { requires_onboarding: true, modules_done: 3 },
          "2": { calls: 10, show_rate: 50, modules_done: 6 },
          "3": { calls: 30, show_rate: 60, close_rate: 15, modules_done: 10 },
          "4": { calls: 50, show_rate: 65, close_rate: 20, requires_certification: true },
          "5": { calls: 100, show_rate: 70, close_rate: 25, epc: 50, manual_review: true },
          "6": { calls: 200, show_rate: 75, close_rate: 30, epc: 80, manual_review: true },
          "7": { invitation_only: true },
          "8": { invitation_only: true },
        },
        partner_commission: { level_1: 0.05, level_2: 0.02 },
        template: selectedTemplate,
      };

      const { error } = await supabase.from('product_config').insert({
        product_key: productKey,
        config: config as any,
        status: 'setup_in_progress',
      });

      if (error) throw error;
      setDone(true);
      toast.success(`Produkt "${productName}" erstellt!`);
    } catch (err: any) {
      toast.error('Fehler: ' + (err.message || 'Unbekannt'));
    } finally {
      setCreating(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
          <Check className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Produkt erstellt!</h1>
        <p className="text-muted-foreground">
          <code className="rounded bg-muted px-2 py-1 text-sm font-mono">{productKey}</code> — Status: <Badge variant="outline">setup_in_progress</Badge>
        </p>
        <p className="text-sm text-muted-foreground">
          Landing Page: <code className="text-primary">/lp/{productKey}</code>
        </p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => { setDone(false); setStep(0); setProductName(''); setSelectedTemplate(null); }}>
            Weiteres Produkt erstellen
          </Button>
          <Button onClick={() => window.location.href = '/members/admin/products'}>
            Zur Produktübersicht
          </Button>
        </div>
      </div>
    );
  }

  const totalSteps = 5;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Neues Produkt erstellen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === 0 ? 'Wähle ein Template als Startpunkt.' : `Schritt ${step} von ${totalSteps}`}
        </p>
      </div>

      {/* Step indicator (visible from step 1+) */}
      {step > 0 && (
        <div className="flex items-center gap-2">
          {[1,2,3,4,5].map(s => (
            <div key={s} className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${s === step ? 'bg-primary text-primary-foreground' : s < step ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {s < step ? <Check className="h-4 w-4" /> : s}
            </div>
          ))}
        </div>
      )}

      {/* Step 0: Template Selection */}
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Templates setzen Standardwerte für KPIs, Provisionen und Lead-Typen. Alles bleibt danach editierbar.
          </p>
          <div className="grid gap-3">
            {TEMPLATES.map(tpl => {
              const Icon = tpl.icon;
              return (
                <button
                  key={tpl.key}
                  onClick={() => applyTemplate(tpl.key)}
                  className="flex items-start gap-4 rounded-xl border border-border p-5 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{tpl.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{tpl.desc}</p>
                  </div>
                  <ChevronRight className="ml-auto mt-2 h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setStep(1)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Ohne Template starten →
          </button>
        </div>
      )}

      {/* Step 1: Branding */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Schritt 1: Branding</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {selectedTemplate && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary">
                Template: <span className="font-semibold">{TEMPLATES.find(t => t.key === selectedTemplate)?.label}</span> — Standardwerte vorausgefüllt
              </div>
            )}
            <div>
              <Label>Produktname *</Label>
              <Input value={productName} onChange={e => setProductName(e.target.value)} placeholder="z.B. Sales Mastery Pro" maxLength={50} />
              <p className="mt-1 text-xs text-muted-foreground">Product Key: <code>{productKey}</code></p>
            </div>
            <div>
              <Label>Markenname</Label>
              <Input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="z.B. Radiant Academy" maxLength={50} />
            </div>
            <div>
              <Label>Design-Preset</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {THEME_PRESETS.map(t => (
                  <button key={t.key} onClick={() => setThemeKey(t.key)}
                    className={`rounded-lg border p-3 text-left transition-colors ${themeKey === t.key ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: KPIs */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Schritt 2: KPI-Auswahl</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {KPI_OPTIONS.map(k => (
              <div key={k.key} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">{k.label}</span>
                <Switch checked={kpis[k.key] || false} onCheckedChange={v => setKpis(prev => ({ ...prev, [k.key]: v }))} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Commissions */}
      {step === 3 && (
        <Card>
          <CardHeader><CardTitle>Schritt 3: Provisionsstruktur</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(commissions).map(([key, val]) => (
              <div key={key} className="flex items-center gap-3 rounded-lg border p-3">
                <span className="flex-1 text-sm font-medium">{val.label}</span>
                <div className="flex items-center gap-1">
                  <Input type="number" className="h-8 w-20 text-sm" step="0.01" min="0" max="1"
                    value={val.rate} onChange={e => setCommissions(prev => ({
                      ...prev, [key]: { ...prev[key], rate: parseFloat(e.target.value) || 0 }
                    }))} />
                  <span className="text-xs text-muted-foreground">= {(val.rate * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Level Names */}
      {step === 4 && (
        <Card>
          <CardHeader><CardTitle>Schritt 4: Level-Bezeichnungen</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {levels.map((l, i) => (
              <div key={l.key} className="flex items-center gap-2 rounded-lg border p-3">
                <Badge variant="outline" className="font-mono text-xs shrink-0">L{l.level}</Badge>
                <Input className="h-8 text-sm" value={l.de} maxLength={40}
                  onChange={e => setLevels(prev => prev.map((x, j) => j === i ? { ...x, de: e.target.value } : x))} />
                <Input className="h-8 text-sm" value={l.en} maxLength={40}
                  onChange={e => setLevels(prev => prev.map((x, j) => j === i ? { ...x, en: e.target.value } : x))} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Step 5: Lead Types */}
      {step === 5 && (
        <Card>
          <CardHeader><CardTitle>Schritt 5: Lead-Typen</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {leadTypes.map((lt, i) => (
              <div key={lt.key} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{lt.label}</p>
                  <p className="text-xs text-muted-foreground">{lt.description}</p>
                </div>
                <Switch checked={lt.active} onCheckedChange={v => setLeadTypes(prev => prev.map((x, j) => j === i ? { ...x, active: v } : x))} />
              </div>
            ))}
            <div className="flex gap-2">
              <Input placeholder="Key (z.B. b2b)" value={newLeadKey} onChange={e => setNewLeadKey(e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Label" value={newLeadLabel} onChange={e => setNewLeadLabel(e.target.value)} className="h-8 text-sm" />
              <Button size="sm" variant="outline" onClick={() => {
                if (newLeadKey && newLeadLabel) {
                  setLeadTypes(prev => [...prev, { key: newLeadKey, label: newLeadLabel, description: '', active: true }]);
                  setNewLeadKey(''); setNewLeadLabel('');
                }
              }}>+</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      {step > 0 && (
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(s => s - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Zurück
          </Button>
          {step < 5 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !productName.trim()}>
              Weiter <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={creating}>
              <Rocket className="mr-1 h-4 w-4" />
              {creating ? 'Erstellen…' : 'Produkt erstellen'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
