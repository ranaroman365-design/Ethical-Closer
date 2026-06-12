import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Canonical Decision Engine Enforcement Tests
 *
 * These tests verify that no file outside the canonical decision engine
 * independently computes lead quality, priority, or attendance risk.
 */

const SRC = path.resolve(__dirname, '..');

function readAllTsFiles(dir: string): Array<{ file: string; content: string }> {
  const results: Array<{ file: string; content: string }> = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'test') {
        results.push(...readAllTsFiles(full));
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
        results.push({ file: full, content: fs.readFileSync(full, 'utf8') });
      }
    }
  } catch { /* skip */ }
  return results;
}

const CANONICAL_FILES = [
  'canonical-decision-engine.ts',
  'lead-scoring-engine.ts',
  'canonical-attendance.ts',
  'conversion-state-machine.ts',
  'conversion-intelligence-engine.ts',
];

function isCanonicalFile(filePath: string): boolean {
  return CANONICAL_FILES.some(f => filePath.endsWith(f));
}

const allFiles = readAllTsFiles(SRC);
const nonCanonicalFiles = allFiles.filter(f => !isCanonicalFile(f.file));

// T1: No dashboard computes lead quality manually
describe('T1: No dashboard computes lead quality manually', () => {
  const dashboardFiles = nonCanonicalFiles.filter(f =>
    f.file.includes('Dashboard') || f.file.includes('Intelligence') || f.file.includes('Overview') ||
    f.file.includes('Pipeline') || f.file.includes('Ranking') || f.file.includes('Assignment')
  );

  it('no dashboard uses inline hot/warm/cold classification', () => {
    const violations: string[] = [];
    for (const f of dashboardFiles) {
      // Match patterns like: condition ? 'hot' : 'warm' : 'cold' (inline ternaries)
      if (/['"]hot['"].*['"]warm['"].*['"]cold['"]/.test(f.content)) {
        violations.push(f.file);
      }
    }
    expect(violations, `Files with inline hot/warm/cold: ${violations.join(', ')}`).toEqual([]);
  });

  it('no dashboard manually derives quality from quiz_score thresholds', () => {
    const violations: string[] = [];
    for (const f of dashboardFiles) {
      if (/quiz_score\s*>=?\s*\d+\s*\?/.test(f.content) && !f.file.includes('ApplyQuiz')) {
        violations.push(f.file);
      }
    }
    expect(violations, `Files with inline quiz_score quality derivation: ${violations.join(', ')}`).toEqual([]);
  });

  it('no dashboard filters by raw A/B/C quality grades', () => {
    const violations: string[] = [];
    for (const f of dashboardFiles) {
      // Direct A/B/C comparison without canonical mapping
      if (/lead_quality\s*===?\s*['"]A['"]/.test(f.content) && !f.content.includes('mapLegacyQualityGrade')) {
        violations.push(f.file);
      }
    }
    expect(violations, `Files with raw A/B/C quality filters: ${violations.join(', ')}`).toEqual([]);
  });
});

// T2: No booking logic computes priority manually
describe('T2: No booking logic computes priority manually', () => {
  const bookingFiles = nonCanonicalFiles.filter(f =>
    f.file.includes('Booking') || f.file.includes('booking') || f.file.includes('Slot')
  );

  it('useLeadQuality uses deriveLeadQuality from canonical engine', () => {
    const leadQualityHook = allFiles.find(f => f.file.endsWith('useLeadQuality.ts'));
    expect(leadQualityHook).toBeDefined();
    expect(leadQualityHook!.content).toContain('deriveLeadQuality');
    expect(leadQualityHook!.content).toContain('canonical-decision-engine');
  });

  it('no booking file has inline tier computation from score thresholds', () => {
    const violations: string[] = [];
    for (const f of bookingFiles) {
      // Pattern: score >= N ? "high" : score >= M ? "medium" : "low"
      if (/score\s*>=?\s*\d+\s*\?\s*["']high["']/.test(f.content) && !f.file.endsWith('useLeadQuality.ts')) {
        violations.push(f.file);
      }
    }
    expect(violations, `Booking files with inline priority: ${violations.join(', ')}`).toEqual([]);
  });
});

// T3: No reminder logic computes attendance risk manually
describe('T3: No reminder logic computes attendance risk manually', () => {
  const reminderFiles = nonCanonicalFiles.filter(f =>
    f.file.includes('reminder') || f.file.includes('Reminder') ||
    f.file.includes('attendance') || f.file.includes('Attendance') ||
    f.file.includes('whatsapp') || f.file.includes('WhatsApp')
  );

  it('no reminder/attendance file derives risk from no_show count inline', () => {
    const violations: string[] = [];
    for (const f of reminderFiles) {
      // Match: total_no_shows >= N ? 'high' or no_shows > N ? 'risk'
      if (/no_show[s]?\s*>=?\s*\d+\s*\?\s*["'](high|risk|critical)["']/.test(f.content)) {
        violations.push(f.file);
      }
    }
    expect(violations, `Files with inline attendance risk: ${violations.join(', ')}`).toEqual([]);
  });

  it('SmartAlerts uses canonical deriveAttendanceRisk', () => {
    const smartAlerts = allFiles.find(f => f.file.endsWith('SmartAlerts.tsx'));
    expect(smartAlerts).toBeDefined();
    expect(smartAlerts!.content).toContain('deriveAttendanceRisk');
    expect(smartAlerts!.content).toContain('canonical-decision-engine');
  });
});

// T4: Canonical decision controls grouping consistently
describe('T4: Canonical decision controls grouping consistently', () => {
  it('countCanonicalEvents works correctly', async () => {
    const { countCanonicalEvents } = await import('@/lib/canonical-decision-engine');
    const events = [
      { event_name: 'lead_submitted' },
      { event_name: 'lead_created' },
      { event_type: 'quiz_completed' },
      { event_type: 'booking_completed' },
      { event_type: 'call_showed' },
      { event_type: 'deal_won' },
      { event_type: 'deal_lost' }, // unmapped
    ];
    const counts = countCanonicalEvents(events);
    expect(counts.lead_created).toBe(2);
    expect(counts.quiz_completed).toBe(1);
    expect(counts.booked).toBe(1);
    expect(counts.showed).toBe(1);
    expect(counts.closed_won).toBe(1);
  });

  it('groupByPriority returns correct structure', async () => {
    const { groupByPriority } = await import('@/lib/canonical-decision-engine');
    const leads = [
      { id: '1', phone_valid: true, qualification_bucket: 'high', phone: '+49123', total_no_shows: 0 },
      { id: '2', phone_valid: false },
      { id: '3', phone_valid: true, qualification_bucket: 'mid', phone: '+49456', total_no_shows: 0, quiz_score: 8 },
    ];
    const groups = groupByPriority(leads);
    expect(groups.HIGH.count + groups.MEDIUM.count + groups.LOW.count).toBe(3);
    expect([...groups.HIGH.leadIds, ...groups.MEDIUM.leadIds, ...groups.LOW.leadIds]).toHaveLength(3);
  });

  it('groupByStage groups correctly', async () => {
    const { groupByStage } = await import('@/lib/canonical-decision-engine');
    const leads = [
      { conversion_state: 'new_lead' },
      { conversion_state: 'booked' },
      { conversion_state: 'showed' },
      { conversion_state: 'closed_won' },
      { stage: 'no_show' },
    ];
    const groups = groupByStage(leads);
    expect(groups.new).toBe(1);
    expect(groups.booked).toBe(2); // booked + no_show
    expect(groups.showed).toBe(1);
    expect(groups.closed).toBe(1);
  });
});

// T5: Old fields remain raw inputs only
describe('T5: Old fields remain raw inputs only', () => {
  it('useManualLeadEntry uses deriveLeadQuality, not inline logic', () => {
    const file = allFiles.find(f => f.file.endsWith('useManualLeadEntry.ts'));
    expect(file).toBeDefined();
    expect(file!.content).toContain('deriveLeadQuality');
    // Must NOT contain old hot/warm/cold ternary
    expect(file!.content).not.toMatch(/['"]hot['"].*['"]warm['"].*['"]cold['"]/);
  });

  it('DirectorOffers uses canonical quality terms (high/mid/low)', () => {
    const file = allFiles.find(f => f.file.endsWith('DirectorOffers.tsx'));
    expect(file).toBeDefined();
    // Should NOT use hot/warm/cold for new defaults
    expect(file!.content).not.toMatch(/lead_quality:\s*['"]warm['"]/);
    expect(file!.content).not.toMatch(/lead_quality:\s*['"]hot['"]/);
    expect(file!.content).not.toMatch(/lead_quality:\s*['"]cold['"]/);
  });
});
