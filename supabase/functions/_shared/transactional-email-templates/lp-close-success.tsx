/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  name?: string
  nextStepUrl?: string
}

const Email = ({ name, nextStepUrl = 'https://ethical-closing.lovable.app/members/dashboard' }: Props) => (
  <LpShell
    preview="Nächster Schritt"
    greetingName={name}
    paragraphs={[
      'danke für das Gespräch.',
      'Die nächsten Schritte sind jetzt klar definiert.',
      'Du findest alles hier:',
    ]}
    inlineLink={{ label: 'Nächste Schritte ansehen', url: nextStepUrl }}
  >
    <p style={{ fontSize: '15px', color: '#4A4A4A', lineHeight: '1.75', margin: '24px 0 0' }}>
      Wenn Fragen auftauchen, melde dich jederzeit.
    </p>
  </LpShell>
)

export const template = {
  component: Email,
  subject: 'Nächster Schritt',
  displayName: 'LP · Erfolgreiches Gespräch / Close',
  previewData: { name: 'Anna' },
} satisfies TemplateEntry
