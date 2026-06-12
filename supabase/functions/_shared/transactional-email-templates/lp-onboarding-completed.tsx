/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  first_name?: string
  platform_link?: string
}

const Email = ({
  first_name,
  platform_link = 'https://ethicalcloser.de/members/dashboard',
}: Props) => (
  <LpShell
    preview="Onboarding abgeschlossen"
    title="Onboarding abgeschlossen"
    greetingName={first_name}
    paragraphs={[
      'du hast das Onboarding vollständig durchlaufen.',
      'Ab hier zählt nur noch die Umsetzung. Dein Dashboard zeigt dir den nächsten konkreten Schritt.',
    ]}
    cta={{ label: 'Dashboard öffnen', url: platform_link }}
  />
)

export const template = {
  component: Email,
  subject: 'Onboarding abgeschlossen',
  displayName: 'LP · Onboarding Completed',
  previewData: { first_name: 'Anna', platform_link: 'https://ethicalcloser.de/members/dashboard' },
} satisfies TemplateEntry
