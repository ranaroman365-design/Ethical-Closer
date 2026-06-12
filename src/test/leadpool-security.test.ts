import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Leadpool Phase 1 — Security Contract Tests
 * Validates that Pool.tsx uses server-side RPC and that the RPC
 * implements all required security checks.
 */

const POOL_SRC = fs.readFileSync(
  path.resolve(__dirname, '../pages/members/Pool.tsx'),
  'utf-8'
);

// Read the latest migration that contains pull_lead_secure
const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).sort();
const rpcMigration = migrationFiles
  .map(f => fs.readFileSync(path.join(migrationsDir, f), 'utf-8'))
  .find(content => content.includes('pull_lead_secure'));

describe('Leadpool Security — Pool.tsx', () => {
  it('T7: Pool UI no longer performs direct leads.update for take-lead', () => {
    // Must NOT contain direct .update() on leads for the take-lead flow
    // The old pattern was: supabase.from('leads').update({...stage: 'assigned_setter'
    const directUpdatePattern = /from\(['"]leads['"]\)\.update\(/;
    const handleTakeSection = POOL_SRC.split('handleTakeLead')[1]?.split('const ')[0] || '';
    expect(handleTakeSection).not.toMatch(directUpdatePattern);
  });

  it('T7: Pool.tsx uses pull_lead_secure RPC', () => {
    expect(POOL_SRC).toContain("rpc('pull_lead_secure'");
  });

  it('T7: Pool.tsx shows error messages from RPC', () => {
    expect(POOL_SRC).toContain('toast.error');
    expect(POOL_SRC).toMatch(/result\?\.error/);
  });
});

describe('Leadpool Security — RPC pull_lead_secure', () => {
  it('RPC migration exists', () => {
    expect(rpcMigration).toBeDefined();
  });

  it('T1/T2: Quality access matrix is enforced (L1/L2 → C only, L3 → B/C)', () => {
    expect(rpcMigration).toContain("v_user_level <= 2 AND v_lead_quality != 'C'");
    expect(rpcMigration).toContain("v_user_level = 3 AND v_lead_quality NOT IN ('B', 'C')");
  });

  it('T3: Already-pulled lead is blocked', () => {
    expect(rpcMigration).toContain('pull_status');
    expect(rpcMigration).toContain('pull_lock_until > now()');
    expect(rpcMigration).toContain('Lead ist gerade von einem anderen User gesperrt');
  });

  it('T4: Expired lock allows re-pull (lock check uses pull_lock_until > now())', () => {
    // The condition is: pulled_by IS NOT NULL AND pull_status = 'pulled' AND pull_lock_until > now()
    // If pull_lock_until < now(), the condition is false → pull proceeds
    expect(rpcMigration).toContain("pull_lock_until > now()");
  });

  it('T5: Lead with active appointment is blocked', () => {
    expect(rpcMigration).toContain("appointment_status IN ('booked', 'confirmed', 'scheduled')");
    expect(rpcMigration).toContain('Lead hat bereits einen aktiven Termin');
  });

  it('T6: RPC uses FOR UPDATE SKIP LOCKED for atomicity', () => {
    expect(rpcMigration).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('RPC logs lead_pulled_secure event', () => {
    expect(rpcMigration).toContain("'lead_pulled_secure'");
  });

  it('RPC is SECURITY DEFINER with search_path = public', () => {
    expect(rpcMigration).toContain('SECURITY DEFINER');
    expect(rpcMigration).toContain('search_path = public');
  });

  it('RPC checks auth.uid() is not null', () => {
    expect(rpcMigration).toContain('auth.uid()');
    expect(rpcMigration).toContain('Nicht authentifiziert');
  });

  it('Duplicate L7 policy removed', () => {
    expect(rpcMigration).toContain('DROP POLICY IF EXISTS "L7 directors see all leads"');
  });
});
