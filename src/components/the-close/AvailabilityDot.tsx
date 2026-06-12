import type { AvailabilityKey } from '@/types/the-close';

const DOT_COLORS: Record<AvailabilityKey, string> = {
  available: '#22C55E',
  open: '#F59E0B',
  unavailable: '#6B7280',
};

const LABELS: Record<AvailabilityKey, string> = {
  available: 'Verfügbar',
  open: 'Offen für Anfragen',
  unavailable: 'Nicht verfügbar',
};

interface AvailabilityDotProps {
  availability: AvailabilityKey;
  showLabel?: boolean;
}

export function AvailabilityDot({ availability, showLabel }: AvailabilityDotProps) {
  return (
    <span className="inline-flex items-center">
      <span
        className="inline-block rounded-full"
        style={{ width: 8, height: 8, background: DOT_COLORS[availability] }}
      />
      {showLabel && (
        <span className="ml-1.5" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', color: '#7A7568' }}>
          {LABELS[availability]}
        </span>
      )}
    </span>
  );
}
