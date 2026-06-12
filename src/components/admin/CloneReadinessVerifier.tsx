import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from 'lucide-react';

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const REQUIRED_FUNCTIONS = [
  'promote_user',
  'auto_welcome_community',
  'distribute_commissions',
  'evaluate_user_for_promotion',
  'get_user_product_key',
];

const FORBIDDEN_PATTERNS = [
  /CASE\s+.*?\s+WHEN\s+['"]trainee['"]/i,
  /CASE\s+.*?\s+WHEN\s+['"]associate['"]/i,
  /CASE\s+.*?\s+WHEN\s+1\s+THEN/i,
  /CASE\s+.*?\s+WHEN\s+2\s+THEN/i,
];

export default function CloneReadinessVerifier() {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const run = async () => {
    setRunning(true);
    setDone(false);
    const checks: CheckResult[] = [];

    // 1. product_config exists and has ETC seed
    try {
      const { data, error } = await supabase
        .from('product_config')
        .select('product_key, config')
        .eq('product_key', 'etc')
        .single();

      if (error || !data) {
        checks.push({ name: 'product_config: ETC seed', passed: false, detail: error?.message || 'No ETC config found' });
      } else {
        const config = data.config as Record<string, unknown>;
        const hasLevels = Array.isArray(config?.levels);
        const hasComm = !!config?.community_mapping;
        const hasRates = !!config?.commission_rates;
        const hasThresh = !!config?.promotion_thresholds;
        const allPresent = hasLevels && hasComm && hasRates && hasThresh;
        checks.push({
          name: 'product_config: ETC seed',
          passed: allPresent,
          detail: allPresent
            ? `ETC config complete — levels: ${(config.levels as unknown[]).length}, mappings: ✓`
            : `Missing: ${[!hasLevels && 'levels', !hasComm && 'community_mapping', !hasRates && 'commission_rates', !hasThresh && 'promotion_thresholds'].filter(Boolean).join(', ')}`,
        });
      }
    } catch (e: unknown) {
      checks.push({ name: 'product_config: ETC seed', passed: false, detail: String(e) });
    }

    // 2. profiles.product_key exists
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('product_key')
        .limit(1);

      if (error) {
        checks.push({ name: 'profiles.product_key column', passed: false, detail: error.message });
      } else {
        checks.push({ name: 'profiles.product_key column', passed: true, detail: 'Column exists and queryable' });
      }
    } catch (e: unknown) {
      checks.push({ name: 'profiles.product_key column', passed: false, detail: String(e) });
    }

    // 3. Check each required function exists and has no hardcoded CASE logic
    for (const fnName of REQUIRED_FUNCTIONS) {
      try {
        const { data, error } = await supabase.rpc('get_function_source' as any, { fn_name: fnName });
        if (error || !data) {
          checks.push({ name: `fn: ${fnName}`, passed: false, detail: error?.message || 'Function not found' });
          continue;
        }

        const source = data as string;

        // Check for forbidden hardcoded patterns
        const forbidden = FORBIDDEN_PATTERNS.filter(p => p.test(source));
        if (forbidden.length > 0) {
          checks.push({
            name: `fn: ${fnName} (no hardcoding)`,
            passed: false,
            detail: `Found ${forbidden.length} hardcoded CASE pattern(s) — not clone-ready`,
          });
        } else {
          // Check it references product_config
          const refsConfig = /product_config/i.test(source) || fnName === 'get_user_product_key';
          checks.push({
            name: `fn: ${fnName} (config-driven)`,
            passed: refsConfig,
            detail: refsConfig
              ? 'Reads from product_config — clone-ready ✓'
              : 'Does not reference product_config — may still be hardcoded',
          });
        }
      } catch (e: unknown) {
        checks.push({ name: `fn: ${fnName}`, passed: false, detail: String(e) });
      }
    }

    // 4. Clone test — can a second product be read?
    try {
      const { data, error } = await supabase
        .from('product_config')
        .select('product_key')
        .neq('product_key', 'etc');

      if (error) {
        checks.push({ name: 'Clone test: second product readable', passed: false, detail: error.message });
      } else {
        checks.push({
          name: 'Clone test: second product readable',
          passed: true,
          detail: data && data.length > 0
            ? `Found ${data.length} additional product(s): ${data.map(d => d.product_key).join(', ')}`
            : 'No additional products yet — but table is queryable for future clones',
        });
      }
    } catch (e: unknown) {
      checks.push({ name: 'Clone test: second product readable', passed: false, detail: String(e) });
    }

    // 5. Show-up rate formula check
    try {
      const { data, error } = await supabase.rpc('get_function_source' as any, { fn_name: 'recalc_kpis_from_call' });
      if (error || !data) {
        checks.push({ name: 'Show-up rate formula', passed: false, detail: 'Could not read recalc_kpis_from_call' });
      } else {
        const source = data as string;
        const usesCorrectFormula = /showed\s*\+\s*no_show/i.test(source) || /v_showed\s*\+\s*v_no_show/i.test(source);
        checks.push({
          name: 'Show-up rate formula',
          passed: usesCorrectFormula,
          detail: usesCorrectFormula
            ? 'show_rate = showed / (showed + no_show) ✓'
            : 'Formula may still use booked as denominator',
        });
      }
    } catch (e: unknown) {
      checks.push({ name: 'Show-up rate formula', passed: false, detail: String(e) });
    }

    setResults(checks);
    setRunning(false);
    setDone(true);
  };

  const passCount = results.filter(r => r.passed).length;
  const total = results.length;
  const allPassed = total > 0 && passCount === total;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clone-Readiness Verification</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Validates that the system is fully config-driven and clone-ready.
          </p>
        </div>
        <Button onClick={run} disabled={running} size="lg">
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
          {running ? 'Running…' : 'Run Verification'}
        </Button>
      </div>

      {done && (
        <Card className={allPassed ? 'border-green-500/40 bg-green-500/5' : 'border-destructive/40 bg-destructive/5'}>
          <CardContent className="py-4 text-center">
            <Badge variant={allPassed ? 'default' : 'destructive'} className="text-sm px-4 py-1">
              {allPassed ? '✅ CLONE-READY' : `⚠️ ${passCount}/${total} checks passed`}
            </Badge>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Results ({passCount}/{total})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map((r, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border/50 p-3">
                {r.passed
                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                  : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground break-all">{r.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
