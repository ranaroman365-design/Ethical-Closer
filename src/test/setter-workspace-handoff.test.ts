/**
 * E2E Regression Tests — SetterWorkspace Closer Handoff
 *
 * Validates that the SetterWorkspace handoff flow:
 * 1. Uses create_manual_appointment RPC (not direct insert)
 * 2. Creates appointments with status = 'booked'
 * 3. Sets lead_id, closer_id, owner_id correctly
 * 4. Logs lead_events and calendar_events
 * 5. No-show scheduler can detect these appointments
 * 6. No duplicate active appointments per lead
 */
import { describe, it, expect } from 'vitest';

// ── 1. SetterWorkspace uses RPC, not direct insert ──

describe('SetterWorkspace Handoff — RPC Migration', () => {
  it('SetterWorkspace.tsx does NOT contain direct appointments.insert', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/pages/members/SetterWorkspace.tsx', 'utf-8');

    // Must NOT have direct insert into appointments
    expect(source).not.toMatch(/from\(['"]appointments['"]\)\.insert/);
    expect(source).not.toMatch(/appointment_status:\s*['"]scheduled['"]/);

    // Must call the RPC
    expect(source).toMatch(/rpc\(['"]create_manual_appointment['"]/);
  });

  it('RPC call passes p_closer_id and p_setter_notes', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/pages/members/SetterWorkspace.tsx', 'utf-8');

    expect(source).toContain('p_closer_id');
    expect(source).toContain('p_setter_notes');
    expect(source).toContain("p_call_type: 'closer_call'");
  });
});

// ── 2. Appointment status contract ──

describe('Appointment Status Contract', () => {
  it('no frontend code sets appointment_status to "scheduled" on insert', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const glob = await import('fs');

    // Check all component/page files
    const checkDir = (dir: string) => {
      const entries = glob.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
          if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
          if (fullPath.includes('types.ts')) continue;
          if (fullPath.includes('canonical-decision-engine.ts')) continue; // type def, not insert
          const content = fs.readFileSync(fullPath, 'utf-8');
          // Check for direct insert with scheduled status
          const hasScheduledInsert = /\.insert\([^)]*appointment_status:\s*['"]scheduled['"]/.test(content);
          if (hasScheduledInsert) {
            throw new Error(`${fullPath} still inserts appointments with status "scheduled"`);
          }
        }
      }
    };

    checkDir('src/pages');
    checkDir('src/components');
    checkDir('src/hooks');
  });
});

// ── 3. No-Show Scheduler Compatibility ──

describe('No-Show Scheduler — booked status coverage', () => {
  it('automation-scheduler checks for "booked" in all appointment queries', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('supabase/functions/automation-scheduler/index.ts', 'utf-8');

    // Find all .in("appointment_status", [...]) patterns
    const statusFilters = source.match(/\.in\(\s*["']appointment_status["']\s*,\s*\[([^\]]+)\]/g);
    expect(statusFilters).not.toBeNull();
    expect(statusFilters!.length).toBeGreaterThanOrEqual(3);

    for (const filter of statusFilters!) {
      expect(filter).toContain('"booked"');
    }
  });

  it('no-show detection covers booked appointments', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('supabase/functions/automation-scheduler/index.ts', 'utf-8');

    // The no-show section must include booked
    const noShowSection = source.substring(
      source.indexOf('No-show detection'),
      source.indexOf('No-Show Stage 2')
    );
    expect(noShowSection).toContain('"booked"');
  });
});

// ── 4. create_manual_appointment RPC contract ──

describe('create_manual_appointment RPC contract', () => {
  it('RPC accepts p_closer_id parameter', async () => {
    const fs = await import('fs');
    const migrationDir = 'supabase/migrations';
    const files = fs.readdirSync(migrationDir).sort().reverse();

    let rpcFound = false;
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, 'utf-8');
      if (content.includes('create_manual_appointment')) {
        expect(content).toContain('p_closer_id');
        rpcFound = true;
        break;
      }
    }
    expect(rpcFound).toBe(true);
  });

  it('RPC logs calendar_events on appointment creation', async () => {
    const fs = await import('fs');
    const migrationDir = 'supabase/migrations';
    const files = fs.readdirSync(migrationDir).sort().reverse();

    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, 'utf-8');
      if (content.includes('create_manual_appointment') && content.includes('p_closer_id')) {
        expect(content).toContain('calendar_events');
        break;
      }
    }
  });

  it('RPC prevents duplicate active appointments per lead', async () => {
    const fs = await import('fs');
    const migrationDir = 'supabase/migrations';
    const files = fs.readdirSync(migrationDir).sort().reverse();

    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, 'utf-8');
      if (content.includes('create_manual_appointment') && content.includes('p_closer_id')) {
        expect(content).toContain('lead_has_active_appointment');
        break;
      }
    }
  });
});

// ── 5. Handoff data integrity ──

describe('Handoff data integrity', () => {
  it('SetterWorkspace updates lead stage to assigned_closer after RPC', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/pages/members/SetterWorkspace.tsx', 'utf-8');

    // After RPC call, lead should be updated to assigned_closer
    const rpcCallIdx = source.indexOf("rpc('create_manual_appointment'");
    const afterRpc = source.substring(rpcCallIdx);

    expect(afterRpc).toContain("stage: 'assigned_closer'");
    expect(afterRpc).toContain('lead_transitions');
  });

  it('SetterWorkspace sends closer notification email', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/pages/members/SetterWorkspace.tsx', 'utf-8');

    expect(source).toContain("'send-transactional-email'");
    expect(source).toContain("templateName: 'setter-assigned'");
  });
});
