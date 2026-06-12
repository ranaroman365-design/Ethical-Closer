/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

const CALL_TYPE_LABELS: Record<string, string> = {
  setter: 'Persönliches Strategiegespräch',
  closer: 'Strategiegespräch',
  follow_up: 'Follow-Up',
  orientation: 'Orientierungsgespräch',
  strategy: 'Strategiegespräch',
  onboarding: 'Onboarding',
  standard: 'Persönliches Strategiegespräch',
  priority: 'Private Strategy Session',
}

interface Props {
  name?: string
  date?: string
  time?: string
  callType?: string
  duration?: string
  appointmentUrl?: string
}

const Email = ({
  name,
  date = '',
  time = '',
  callType,
  duration,
  appointmentUrl = 'https://ethical-closing.lovable.app/members/dashboard',
}: Props) => {
  const callLabel = callType ? (CALL_TYPE_LABELS[callType] ?? callType) : undefined
  const details = [
    { label: 'Datum', value: date },
    { label: 'Uhrzeit', value: time },
    ...(callLabel ? [{ label: 'Typ', value: callLabel }] : []),
    ...(duration ? [{ label: 'Dauer', value: `${duration} Minuten` }] : []),
  ]

  return (
    <LpShell
      preview="Dein Termin ist bestätigt"
      greetingName={name}
      paragraphs={['dein Termin ist bestätigt.']}
      details={details}
      inlineLink={{ label: 'Termin einsehen oder anpassen', url: appointmentUrl }}
    >
      <p style={{ fontSize: '15px', color: '#4A4A4A', lineHeight: '1.75', margin: '24px 0 0' }}>
        Wir sprechen uns dann.
      </p>
    </LpShell>
  )
}

export const template = {
  component: Email,
  subject: 'Termin bestätigt',
  displayName: 'LP · Terminbestätigung',
  previewData: { name: 'Anna', date: '15. Januar 2026', time: '14:00', callType: 'setter', duration: '30' },
} satisfies TemplateEntry
