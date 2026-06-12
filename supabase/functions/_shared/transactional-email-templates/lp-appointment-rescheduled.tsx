/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  name?: string
  date?: string
  time?: string
  appointmentUrl?: string
}

const Email = ({ name, date = '', time = '', appointmentUrl = 'https://ethical-closing.lovable.app/members/dashboard' }: Props) => (
  <LpShell
    preview="Dein Termin wurde aktualisiert"
    greetingName={name}
    paragraphs={['dein Termin wurde aktualisiert.']}
    details={[
      { label: 'Neuer Termin', value: `${date}${time ? ` – ${time}` : ''}` },
    ]}
    inlineLink={{ label: 'Alle Details ansehen', url: appointmentUrl }}
  >
    <p style={{ fontSize: '15px', color: '#4A4A4A', lineHeight: '1.75', margin: '24px 0 0' }}>
      Bis bald.
    </p>
  </LpShell>
)

export const template = {
  component: Email,
  subject: 'Termin aktualisiert',
  displayName: 'LP · Termin verschoben',
  previewData: { name: 'Anna', date: '17. Januar 2026', time: '16:00' },
} satisfies TemplateEntry
