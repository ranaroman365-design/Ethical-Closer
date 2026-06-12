/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  first_name?: string
  next_step_link?: string
}

const Email = ({
  first_name,
  next_step_link = 'https://ethicalcloser.de/members/dashboard',
}: Props) => (
  <LpShell
    preview="Dein Gespräch wurde abgeschlossen"
    title="Dein Gespräch wurde abgeschlossen"
    greetingName={first_name}
    paragraphs={[
      'danke für das Gespräch.',
      'Die nächsten Schritte sind in deinem Bereich hinterlegt.',
    ]}
    cta={{ label: 'Nächsten Schritt öffnen', url: next_step_link }}
  />
)

export const template = {
  component: Email,
  subject: 'Dein Gespräch wurde abgeschlossen',
  displayName: 'LP · Successful Interview',
  previewData: { first_name: 'Anna', next_step_link: 'https://ethicalcloser.de/members/dashboard' },
} satisfies TemplateEntry
