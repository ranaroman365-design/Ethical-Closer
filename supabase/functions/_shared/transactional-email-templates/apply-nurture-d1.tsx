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
    preview="Bewerbung erhalten — kein Druck."
    greetingName={name}
    paragraphs={[
      'wir haben deine Bewerbung erhalten — danke, dass du dir die Zeit genommen hast.',
      'Bei uns gilt: Selection over Pressure. Du musst nichts tun. Wir melden uns nur, wenn ein Karriereweg wirklich zu dir passt.',
      'Wenn sich seit deiner Bewerbung etwas verändert hat — Zeit, Klarheit, Energie — kannst du den Selbstcheck jederzeit neu starten:',
    ]}
    inlineLink={{ label: 'Selbstcheck neu starten', url: retakeUrl }}
  >
    <p style={{ fontSize: '15px', color: '#4A4A4A', lineHeight: '1.75', margin: '0 0 18px' }}>
      Du hörst von uns in den nächsten Tagen wieder — ruhig, ohne Verkaufston.
    </p>
  </LpShell>
)

export const template = {
  component: Email,
  subject: 'Bewerbung erhalten',
  displayName: 'Apply Nurture · T+1 Tag',
  previewData: { name: 'Anna' },
} satisfies TemplateEntry
