/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  name?: string
  platformUrl?: string
}

const Email = ({ name, platformUrl = 'https://ethical-closing.lovable.app/members/dashboard' }: Props) => (
  <LpShell
    preview="Willkommen"
    greetingName={name}
    paragraphs={[
      'willkommen.',
      'Du hast jetzt Zugang zu allen relevanten Inhalten und nächsten Schritten.',
      'Hier geht es weiter:',
    ]}
    inlineLink={{ label: 'Zur Plattform', url: platformUrl }}
  >
    <p style={{ fontSize: '15px', color: '#4A4A4A', lineHeight: '1.75', margin: '24px 0 0' }}>
      Nimm dir die Zeit, alles in Ruhe durchzugehen.
    </p>
  </LpShell>
)

export const template = {
  component: Email,
  subject: 'Willkommen',
  displayName: 'LP · Willkommen / Onboarding',
  previewData: { name: 'Anna' },
} satisfies TemplateEntry
