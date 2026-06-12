/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  name?: string
  levelUrl?: string
}

const Email = ({ name, levelUrl = 'https://ethical-closing.lovable.app/members/dashboard/level' }: Props) => (
  <LpShell
    preview="Dein nächster Schritt"
    greetingName={name}
    paragraphs={[
      'du hast den nächsten Schritt erreicht.',
      'Dein aktuelles Level wurde aktualisiert.',
      'Hier findest du, was jetzt wichtig ist:',
    ]}
    inlineLink={{ label: 'Level ansehen', url: levelUrl }}
  >
    <p style={{ fontSize: '15px', color: '#4A4A4A', lineHeight: '1.75', margin: '24px 0 0' }}>
      Weiter so.
    </p>
  </LpShell>
)

export const template = {
  component: Email,
  subject: 'Dein nächster Schritt',
  displayName: 'LP · Beförderung / Level Up',
  previewData: { name: 'Anna' },
} satisfies TemplateEntry
