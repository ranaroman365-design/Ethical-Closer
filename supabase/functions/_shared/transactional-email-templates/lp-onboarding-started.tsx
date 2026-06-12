/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  first_name?: string
  next_step_link?: string
  platform_link?: string
}

const Email = ({
  first_name,
  next_step_link = 'https://ethicalcloser.de/members/dashboard',
  platform_link,
}: Props) => (
  <LpShell
    preview="Dein Onboarding hat begonnen"
    title="Willkommen im System"
    greetingName={first_name}
    paragraphs={[
      'dein Onboarding ist eingerichtet.',
      'Der erste Schritt steht bereit. Nimm dir die Zeit, ihn ruhig und vollständig abzuschließen.',
    ]}
    cta={{ label: 'Nächsten Schritt öffnen', url: next_step_link ?? platform_link! }}
  />
)

export const template = {
  component: Email,
  subject: 'Dein Onboarding hat begonnen',
  displayName: 'LP · Onboarding Started',
  previewData: { first_name: 'Anna', next_step_link: 'https://ethicalcloser.de/members/onboarding' },
} satisfies TemplateEntry
