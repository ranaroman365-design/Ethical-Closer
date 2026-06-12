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
    preview="Was uns bei deinem Selbstcheck aufgefallen ist."
    greetingName={name}
    paragraphs={[
      'kurzer, ehrlicher Hinweis: dein Selbstcheck deutet darauf hin, dass es aktuell noch zu früh für einen vollen Karriereweg bei uns ist.',
      'Das ist kein Urteil — es ist Klarheit. Die meisten unserer stärksten Closer haben am Anfang genau hier gestanden: zwischen Interesse und Entscheidung.',
      'Wenn du in den nächsten Wochen Klarheit gewinnst — über Zeit, Energie oder Ziel — bist du jederzeit willkommen, neu zu starten:',
    ]}
    inlineLink={{ label: 'Bewerbung erneut starten', url: retakeUrl }}
  >
    <p style={{ fontSize: '15px', color: '#4A4A4A', lineHeight: '1.75', margin: '0 0 18px' }}>
      Wir sind hier, wenn der Zeitpunkt für dich stimmt.
    </p>
  </LpShell>
)

export const template = {
  component: Email,
  subject: 'Was wir bei deinem Selbstcheck gesehen haben',
  displayName: 'Apply Nurture · T+3 Tage',
  previewData: { name: 'Anna' },
} satisfies TemplateEntry
