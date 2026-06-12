/**
 * Sprint Gap Closure — Go-Live Verification Tests
 */
import { describe, it, expect } from 'vitest';
import { SPRINT_GAPS, getSprintGap, SPRINT_OBJECTION_CODES, OBJECTION_LABELS } from '@/lib/sprint-gap-closure-canon';

describe('Sprint Gap Closure — Canon', () => {
  it('registers all 6 gaps', () => {
    expect(SPRINT_GAPS).toHaveLength(6);
    expect(SPRINT_GAPS.map(g => g.id)).toEqual(['GAP_1','GAP_2','GAP_3','GAP_4','GAP_5','GAP_6']);
  });

  it('GAP_1 has 3 escalation stages (4h/12h/24h)', () => {
    const g = getSprintGap('GAP_1') as any;
    expect(g.stages).toHaveLength(3);
    expect(g.stages[0].thresholdMin).toBe(240);
    expect(g.stages[1].thresholdMin).toBe(720);
    expect(g.stages[2].thresholdMin).toBe(1440);
  });

  it('GAP_2 covers 5min + 2h + existing 24h waves', () => {
    const g = getSprintGap('GAP_2') as any;
    expect(g.waves).toContain('5min');
    expect(g.waves).toContain('2h');
    expect(g.waves).toContain('24h_existing');
  });

  it('GAP_3 is a DB trigger guard', () => {
    const g = getSprintGap('GAP_3') as any;
    expect(g.trigger).toBe('trg_funnel_separation_guard');
  });

  it('GAP_4 defines 7 objection codes and 3-touch cadence', () => {
    const g = getSprintGap('GAP_4') as any;
    expect(g.objectionCodes).toHaveLength(7);
    expect(g.sequenceDays).toEqual([1, 3, 7]);
    expect(g.sequenceChannels).toEqual(['whatsapp', 'sms', 'email']);
  });

  it('GAP_5 is opt-in via ai_setter_settings.instant_combo_enabled', () => {
    const g = getSprintGap('GAP_5') as any;
    expect(g.optInFlag).toBe('ai_setter_settings.instant_combo_enabled');
    expect(g.idempotencyColumn).toBe('leads.combo_dispatched_at');
  });

  it('GAP_6 defines day2_call + day4_call task types', () => {
    const g = getSprintGap('GAP_6') as any;
    expect(g.taskTypes).toEqual(['day2_call', 'day4_call']);
  });

  it('all 7 objection codes have German labels', () => {
    SPRINT_OBJECTION_CODES.forEach(c => {
      expect(OBJECTION_LABELS[c]).toBeTruthy();
    });
  });
});
