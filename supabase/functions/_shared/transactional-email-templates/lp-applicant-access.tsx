/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  name?: string
  magicLink?: string
}

const Email = ({ name, magicLink = 'https://ethical-closing.lovable.app/members/login' }: Props) => (
  <LpShell
    preview="Dein Zugang zur Bewerberplattform"
    greetingName={name}
    paragraphs={[
      'dein Zugang zur Bewerberplattform ist eingerichtet.',
      'Hier kannst du dich einloggen:',
    ]}
    inlineLink={{ label: 'Zur Bewerberplattform', url: magicLink }}
  >
    <p style={{ fontSize: '15px', color: '#4A4A4A', lineHeight: '1.75', margin: '0 0 18px' }}>
      Dort findest du alle nächsten Schritte übersichtlich zusammengefasst.
    </p>
    <p style={{ fontSize: '15px', color: '#4A4A4A', lineHeight: '1.75', margin: '0 0 18px' }}>
      Wenn etwas unklar ist, melde dich jederzeit.
    </p>
  </LpShell>
)

export const template = {
  component: Email,
  subject: 'Dein Zugang',
  displayName: 'LP · Zugang zur Bewerberplattform',
  previewData: { name: 'Anna', magicLink: 'https://ethical-closing.lovable.app/members/login?token=...' },
} satisfies TemplateEntry
