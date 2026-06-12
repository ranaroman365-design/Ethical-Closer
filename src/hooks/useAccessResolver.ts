import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { normalizeBusinessStage } from '@/lib/stage-utils';

export interface Room {
  id: string;
  slug: string;
  title: string;
  sort_order: number;
  allowed_stages: string[];
  config: Record<string, any>;
  locked?: boolean;
  lockReason?: string;
}

export interface AccessResult {
  rooms: Room[];
  stage: string;
  isAdmin: boolean;
  loading: boolean;
}

const STAGE_ORDER = [
  'opener', 'setter', 'senior_associate',
  'junior_manager', 'manager', 'senior_manager',
  'director', 'partner',
];

// Slugs hidden entirely below a certain level index in STAGE_ORDER
// index: 0=opener(L1), 1=setter(L2), 2=senior_associate(L3), 3=junior_manager(L4),
//        4=manager(L5), 5=senior_manager(L6), 6=director(L7), 7=partner(L8)
const HIDDEN_BELOW_LEVEL: Record<string, number> = {
  'director-onboarding': 6, // L7
  'pool': 6,
  'director-workspace': 6,
  'inner-circle': 7,        // L8 Partner only
  'offer-deck': 3,          // L4
  'quarterly-crossing': 3,  // L4
  'advanced-lab': 4,        // L5 (visible from L5+, locked until purchased)
  'partner-earnings': 7,    // L8 Partner only
  'trainers': 99,           // Hidden for all non-admin users
};

// Slugs visible to all levels but LOCKED below a certain level index
// Shows with lock icon, fully unlocked at or above the threshold
const LOCKED_BELOW_LEVEL: Record<string, { level: number; reason: string }> = {
  'closing-os':     { level: 3, reason: 'Closing OS wird ab Closer (L4) freigeschaltet' },
  'simulation-lab': { level: 3, reason: 'Simulation Lab wird ab Closer (L4) freigeschaltet' },
  'call-review':    { level: 3, reason: 'Call Review wird ab Closer (L4) freigeschaltet' },
  'intelligence':        { level: 4, reason: 'Intelligence Dashboard wird ab Managing Closer (L5) freigeschaltet' },
  'deal-intelligence':   { level: 4, reason: 'Deal Intelligence wird ab Managing Closer (L5) freigeschaltet' },
  'payment-links':       { level: 3, reason: 'Zahlungslinks werden ab Closer (L4) freigeschaltet' },
};

// Workspace visibility: each workspace slug is only shown within a specific level range
// Prevents lower-level workspaces from showing after user has progressed
const WORKSPACE_LEVEL_RANGE: Record<string, { min: number; max: number }> = {
  'opener-workspace':   { min: 0, max: 1 },  // L1–L2 only
  'setter-workspace':   { min: 1, max: 2 },  // L2–L3 only
  'closer-workspace':   { min: 3, max: 7 },  // L4+ always visible
  'director-workspace': { min: 6, max: 7 },  // L7–L8
  'partner-hub':        { min: 7, max: 7 },  // L8 only
};

// Slugs always hidden from menu (routes/sections still exist)
const ALWAYS_HIDDEN_SLUGS = new Set([
  'scale-hub',
]);

// Slugs that must NEVER be locked regardless of stage
const ALWAYS_UNLOCKED_SLUGS = new Set([
  'build-your-team',
  'closer-benefits',
  'career-path',
]);

export function useAccessResolver(): AccessResult {
  const { user, profile, isAdmin } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const resolve = useCallback(async () => {
    if (!user || !profile) {
      setLoading(false);
      return;
    }

    const stage = normalizeBusinessStage((profile as any).business_stage || 'opener');
    const stageIndex = STAGE_ORDER.indexOf(stage);

    // Fetch active rooms filtered by product_key
    const userProductKey = (profile as any)?.product_key || 'etc';
    const { data: allRooms } = await supabase
      .from('rooms')
      .select('id, slug, title, sort_order, allowed_stages, config')
      .eq('status', 'active')
      .eq('product_key', userProductKey)
      .order('sort_order');

    const roomList = (allRooms as Room[]) ?? [];

    // Admin gets full access
    if (isAdmin) {
      setRooms(roomList.map(r => ({ ...r, locked: false })));
      setLoading(false);
      return;
    }

    // Check grants/revokes and mentor status
    const [{ data: grants }, { data: revokes }, { data: mentorAssignments }] = await Promise.all([
      supabase.from('user_access_overrides').select('room_id').eq('user_id', user.id).eq('action_type', 'grant'),
      supabase.from('user_access_overrides').select('room_id').eq('user_id', user.id).eq('action_type', 'revoke'),
      supabase.from('mentor_assignments').select('id').eq('mentor_id', user.id).eq('active', true),
    ]);

    const grantedIds = new Set((grants ?? []).map((g: any) => g.room_id));
    const revokedIds = new Set((revokes ?? []).map((r: any) => r.room_id));
    const isMentor = (mentorAssignments ?? []).length > 0;

    const resolvedRooms: Room[] = [];

    for (const room of roomList) {
      // Skip revoked rooms
      if (revokedIds.has(room.id)) continue;

      // ALWAYS HIDDEN: remove from menu entirely (route still works)
      if (ALWAYS_HIDDEN_SLUGS.has(room.slug)) continue;

      // HIDDEN BELOW LEVEL: completely omit from list
      const hiddenThreshold = HIDDEN_BELOW_LEVEL[room.slug];
      if (hiddenThreshold !== undefined && stageIndex < hiddenThreshold && !grantedIds.has(room.id)) {
        continue; // fully hidden
      }

      // WORKSPACE LEVEL RANGE: only show workspace within its level range
      const wsRange = WORKSPACE_LEVEL_RANGE[room.slug];
      if (wsRange && !grantedIds.has(room.id)) {
        if (stageIndex < wsRange.min || stageIndex > wsRange.max) {
          continue; // outside level range — hide entirely
        }
      }

      // LOCKED BELOW LEVEL: visible but locked below threshold
      const lockRule = LOCKED_BELOW_LEVEL[room.slug];
      if (lockRule && !grantedIds.has(room.id)) {
        if (stageIndex < lockRule.level) {
          resolvedRooms.push({
            ...room,
            locked: true,
            lockReason: lockRule.reason,
          });
          continue;
        }
      }

      // ALWAYS UNLOCKED: never show as locked
      if (ALWAYS_UNLOCKED_SLUGS.has(room.slug)) {
        resolvedRooms.push({ ...room, locked: false });
        continue;
      }

      const stageAllowed = (room.allowed_stages ?? []).map(normalizeBusinessStage).includes(stage);
      const hasGrant = grantedIds.has(room.id);

      // Mentor Space: accessible for mentors or L3/L5/L6+
      if (room.slug === 'mentor-space') {
        const mentorLevels = ['senior_associate', 'manager', 'senior_manager', 'director', 'partner'];
        const stageUnlocked = mentorLevels.includes(stage) || isMentor;
        resolvedRooms.push({
          ...room,
          locked: !stageUnlocked && !hasGrant,
          lockReason: 'Verfügbar ab Senior Setter (L3) oder als Mentor',
        });
        continue;
      }

      // Closer Simulator: visible from L3+, unlocked from L3+
      if (room.slug === 'simulator' || room.slug === 'simulator-closer') {
        const unlocked = stageIndex >= 2 || hasGrant; // index 2 = senior_associate (L3)
        resolvedRooms.push({
          ...room,
          locked: !unlocked,
          lockReason: unlocked ? undefined : 'Verfügbar ab Senior Setter (L3)',
        });
        continue;
      }

      // Setter Simulator: visible to all, unlocked from L2+
      if (room.slug === 'simulator-setter') {
        const unlocked = stageIndex >= 1 || hasGrant; // index 1 = setter (L2)
        resolvedRooms.push({
          ...room,
          locked: !unlocked,
          lockReason: unlocked ? undefined : 'Verfügbar ab Associate Setter (L2)',
        });
        continue;
      }

      // Quarterly Crossing: visible from L4, locked at L4, unlocked from L5+ (after Stripe)
      if (room.slug === 'quarterly-crossing') {
        const unlocked = stageIndex >= 4 || hasGrant; // index 4 = manager (L5)
        resolvedRooms.push({
          ...room,
          locked: !unlocked,
          lockReason: unlocked ? undefined : 'Bewerbung möglich ab Managing Closer (L5)',
        });
        continue;
      }

      // Advanced Lab: visible from L5, ALWAYS locked (preview only) unless explicitly granted
      if (room.slug === 'advanced-lab') {
        resolvedRooms.push({
          ...room,
          locked: !hasGrant,
          lockReason: 'Freischaltung nach Kauf — verfügbar ab Managing Closer (L5)',
        });
        continue;
      }

      // Radiant: visible to all, locked for L0–L1 (index 0–0), unlocked from L2+ (index 1+)
      if (room.slug === 'radiant') {
        const unlocked = stageIndex >= 1 || hasGrant; // index 1 = setter (L2)
        resolvedRooms.push({
          ...room,
          locked: !unlocked,
          lockReason: unlocked ? undefined : 'Verfügbar ab Associate Setter (L2)',
        });
        continue;
      }

      // Certification: visible from L1+, locked until L2+
      if (room.slug === 'certification') {
        const unlocked = stageIndex >= 1 || hasGrant; // index 1 = setter (L2)
        resolvedRooms.push({
          ...room,
          locked: !unlocked,
          lockReason: unlocked ? undefined : 'Die Zertifizierung wird ab Level 2 freigeschaltet.',
        });
        continue;
      }

      // Closer Benefits: visible from L1+, locked until L2+
      if (room.slug === 'closer-benefits') {
        const unlocked = stageIndex >= 1 || hasGrant; // index 1 = setter (L2)
        resolvedRooms.push({
          ...room,
          locked: !unlocked,
          lockReason: unlocked ? undefined : 'Closer Benefits kannst du ab Level 2 nutzen.',
        });
        continue;
      }

      if (stageAllowed || hasGrant) {
        resolvedRooms.push({ ...room, locked: false });
      } else {
        // Show as locked with explanation
        const lockReasons: Record<string, string> = {
          'placement': 'Verfügbar ab Closer / Placement Track (L4)',
        };
        resolvedRooms.push({
          ...room,
          locked: true,
          lockReason: lockReasons[room.slug] || 'Wird mit deinem Karrierefortschritt freigeschaltet',
        });
      }
    }

    resolvedRooms.sort((a, b) => a.sort_order - b.sort_order);
    setRooms(resolvedRooms);
    setLoading(false);
  }, [user, profile, isAdmin]);

  useEffect(() => { resolve(); }, [resolve]);

  return {
    rooms,
    stage: normalizeBusinessStage((profile as any)?.business_stage || 'opener'),
    isAdmin,
    loading,
  };
}
