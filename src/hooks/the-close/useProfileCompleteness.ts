import type { CloserProfile } from '@/types/the-close';

export function useProfileCompleteness(profile: CloserProfile | null): number {
  if (!profile) return 0;
  const fields = [
    profile.display_name,
    profile.headline,
    profile.location,
    profile.languages.length > 0,
    profile.industries.length > 0,
    profile.avg_deal_size,
    profile.closing_rate,
    profile.bio,
    profile.linkedin_url,
    profile.profile_image_url,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}
