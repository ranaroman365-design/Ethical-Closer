/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

/**
 * Cohort-specific Ethical Closing Playbook delivery.
 * Sent after lead capture on /apply. Audience cohort is resolved client-side
 * via getApplyAudience() and passed in as `audience`.
 */

interface Props {
  name?: string
  /** Cohort cohort: "male_ambition" | "default" (default = women variant). */
  audience?: 'male_ambition' | 'default'
  /** Direct PDF URL. If absent, falls back to default women variant. */
  downloadUrl?: string
}

const DEFAULT_WOMEN_URL =
  'https://www.ethicalcloser.de/playbooks/ethical-closing-playbook-women.pdf'

const Email = ({ name, audience = 'default', downloadUrl }: Props) => {
  const isMen = audience === 'male_ambition'
  const url = downloadUrl ?? DEFAULT_WOMEN_URL

  const title = isMen
    ? 'Dein Ethical Closing Playbook — für Männer mit Richtung.'
    : 'Dein Ethical Closing Playbook — ein ruhiger Karriereweg.'

  const paragraphs = isMen
    ? [
        'anbei dein persönliches Exemplar des Ethical Closing Playbooks.',
        'Es ist kein Verkaufsdokument. Es ist ein ruhiger Leitfaden für Männer, die einen modernen, ortsunabhängigen Karriereweg suchen — ohne Hustle, ohne Druck, ohne Geschwätz. Nimm dir 10 Minuten in Ruhe.',
      ]
    : [
        'anbei dein persönliches Exemplar des Ethical Closing Playbooks.',
        'Es ist kein Verkaufsdokument. Es ist ein ruhiger Leitfaden für Frauen, die einen modernen Karriereweg suchen, der Tiefe, Sinn und Selbstbestimmung verbindet. Nimm dir 10 Minuten — in Ruhe, ohne Druck.',
      ]

  return (
    <LpShell
      preview="Dein Ethical Closing Playbook — direkter Zugriff"
      title={title}
      greetingName={name}
      paragraphs={paragraphs}
      cta={{ label: 'Playbook ansehen', url }}
    >
      <p style={{ fontSize: '13px', color: '#8C8C8C', lineHeight: '1.7', margin: '8px 0 0' }}>
        Falls du nach dem Lesen merkst, dass es zu dir passt, kannst du jederzeit
        einen ruhigen Karriere-Check starten unter{' '}
        <a href="https://www.ethicalcloser.de/apply" style={{ color: '#A88A35', textDecoration: 'underline' }}>
          ethicalcloser.de/apply
        </a>
        . Falls nicht — auch gut. Selection over Pressure.
      </p>
    </LpShell>
  )
}

export const template = {
  component: Email,
  subject: 'Dein Ethical Closing Playbook',
  displayName: 'LP · Ethical Closing Playbook (cohort-aware)',
  previewData: {
    name: 'Anna',
    audience: 'default',
    downloadUrl: DEFAULT_WOMEN_URL,
  },
} satisfies TemplateEntry
