/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

const REMINDER_COPY: Record<string, { preview: string; intro: string; closing: string }> = {
  '24h': {
    preview: 'Erinnerung: Dein Termin ist morgen',
    intro: 'morgen steht dein Termin an:',
    closing: 'Wir freuen uns auf dich.',
  },
  '3h': {
    preview: 'In 3 Stunden ist dein Termin',
    intro: 'in wenigen Stunden ist es soweit:',
    closing: 'Bis gleich!',
  },
  '30min': {
    preview: 'Dein Termin beginnt gleich',
    intro: 'dein Termin beginnt in Kürze:',
    closing: 'Bis gleich.',
  },
}

interface Props {
  name?: string
  date?: string
  time?: string
  appointmentUrl?: string
  reminderType?: string
}

const Email = ({
  name,
  date = '',
  time = '',
  appointmentUrl = 'https://ethical-closing.lovable.app/members/dashboard',
  reminderType = '24h',
}: Props) => {
  const copy = REMINDER_COPY[reminderType] || REMINDER_COPY['24h']
  return (
    <LpShell
      preview={copy.preview}
      greetingName={name}
      paragraphs={[copy.intro]}
      details={[
        { label: 'Wann', value: `${date}${time ? ` – ${time}` : ''}` },
      ]}
      inlineLink={{ label: 'Termin einsehen oder anpassen', url: appointmentUrl }}
    >
      <p style={{ fontSize: '15px', color: '#4A4A4A', lineHeight: '1.75', margin: '24px 0 0' }}>
        {copy.closing}
      </p>
    </LpShell>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const subjects: Record<string, string> = {
      '24h': 'Dein Termin ist morgen',
      '3h': 'Dein Termin ist in 3 Stunden',
      '30min': 'Dein Termin beginnt gleich',
    }
    return subjects[data?.reminderType] || 'Erinnerung an deinen Termin'
  },
  displayName: 'LP · Termin-Erinnerung',
  previewData: { name: 'Anna', date: 'Heute', time: '14:00', reminderType: '3h' },
} satisfies TemplateEntry
