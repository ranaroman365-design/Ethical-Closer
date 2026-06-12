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
    preview="Du hast deinen Termin verpasst"
    greetingName={name}
    paragraphs={[
      'du konntest deinen Termin heute nicht wahrnehmen.',
      'Wenn du das Thema weiter verfolgen möchtest, kannst du hier einen neuen Termin wählen:',
    ]}
    inlineLink={{ label: 'Neuen Termin wählen', url: bookingUrl }}
  />
)

export const template = {
  component: Email,
  subject: 'Termin verpasst',
  displayName: 'LP · No-Show',
  previewData: { name: 'Anna' },
} satisfies TemplateEntry
