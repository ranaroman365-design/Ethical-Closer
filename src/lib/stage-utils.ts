import { PRODUCT } from '@/config/product';

const STAGE_ALIASES: Record<string, string> = PRODUCT.career.aliases;

export function normalizeBusinessStage(stage?: string | null): string {
  if (!stage) return 'opener';
  return STAGE_ALIASES[stage] ?? stage;
}
