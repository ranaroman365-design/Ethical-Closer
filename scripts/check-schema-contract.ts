#!/usr/bin/env node
/**
 * Schema Contract Pre-Deploy Guard
 * 
 * Scans source code for forbidden references that violate the schema contract.
 * Run: npx ts-node scripts/check-schema-contract.ts
 * 
 * See: docs/schema-contract.md
 */

import { execSync } from 'child_process';

const FORBIDDEN_PATTERNS = [
  { pattern: 'profiles\\.level\\b', description: 'profiles.level does not exist — use current_phase or user_roles', exclude: 'schema-contract|check-schema' },
  { pattern: 'current_stage', description: 'current_stage does not exist — use current_phase or business_stage', exclude: 'schema-contract|check-schema|types\\.ts|migrations/' },
  { pattern: "processed_events.*event_id|event_id.*processed_events", description: 'processed_events.event_id does not exist — use event_key', exclude: 'schema-contract|check-schema|types\\.ts|migrations/' },
];

let hasViolations = false;

for (const rule of FORBIDDEN_PATTERNS) {
  try {
    const cmd = `rg -n "${rule.pattern}" src/ supabase/functions/ --glob="*.{ts,tsx}" 2>/dev/null | grep -vE "${rule.exclude}" || true`;
    const result = execSync(cmd, { encoding: 'utf8' }).trim();
    if (result) {
      console.error(`\n❌ SCHEMA CONTRACT VIOLATION: ${rule.description}`);
      console.error(result);
      hasViolations = true;
    }
  } catch {
    // grep found nothing — OK
  }
}

if (hasViolations) {
  console.error('\n🚫 Schema contract check FAILED. Fix violations before deploying.');
  process.exit(1);
} else {
  console.log('✅ Schema contract check passed — no forbidden references found.');
  process.exit(0);
}
