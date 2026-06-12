/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  name?: string
  retakeUrl?: string
}

const Email = ({
  name,
  retakeUrl = 'https://www.ethicalcloser.de/apply',
}: Props) => (
  <LpShell
    preview="Zwei Wochen später — vielleicht ist jetzt der Moment."
    greetingName={name}
    paragraphs={[
      'zwei Wochen sind eine kurze, aber oft ehrliche Zeit. Manches klärt sich. Manches nicht.',
      'Falls sich für dich in der Zwischenzeit etwas verschoben hat — mehr Zeit, klareres Ziel, andere Energie — würden wir dich gerne neu einschätzen.',
      'Der Selbstcheck dauert weniger als drei Minuten:',
    ]}
    inlineLink={{ label: 'Erneut bewerben', url: retakeUrl }}
  >
    <p style={{ fontSize: '15px', color: '#4A4A4A', lineHeight: '1.75', margin: '0 0 18px' }}>
      Danach hörst du nichts mehr von uns — versprochen.
    </p>
  </LpShell>
)

export const template = {
  component: Email,
  subject: 'Vielleicht ist jetzt der richtige Moment',
  displayName: 'Apply Nurture · T+14 Tage (Requal)',
  previewData: { name: 'Anna' },
} satisfies TemplateEntry
