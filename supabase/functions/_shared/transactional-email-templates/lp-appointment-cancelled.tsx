/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  name?: string
  bookingUrl?: string
}

const Email = ({ name, bookingUrl = 'https://ethical-closing.lovable.app/booking' }: Props) => (
  <LpShell
    preview="Dein Termin wurde abgesagt"
    greetingName={name}
    paragraphs={[
      'dein Termin wurde abgesagt.',
      'Falls du einen neuen Termin vereinbaren möchtest, kannst du das hier tun:',
    ]}
    inlineLink={{ label: 'Neuen Termin wählen', url: bookingUrl }}
  />
)

export const template = {
  component: Email,
  subject: 'Termin abgesagt',
  displayName: 'LP · Termin abgesagt',
  previewData: { name: 'Anna' },
} satisfies TemplateEntry
