/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  first_name?: string
  magic_link?: string
}

const Email = ({ first_name, magic_link = 'https://ethicalcloser.de/members/login' }: Props) => (
  <LpShell
    preview="Dein sicherer Zugang"
    title="Dein Zugang"
    greetingName={first_name}
    paragraphs={[
      'dein sicherer Zugang ist bereit.',
      'Dieser Link ist persönlich und nur kurze Zeit gültig.',
    ]}
    cta={{ label: 'Zugang öffnen', url: magic_link }}
  />
)

export const template = {
  component: Email,
  subject: 'Dein Zugang',
  displayName: 'LP · Magic Link Access',
  previewData: { first_name: 'Anna', magic_link: 'https://ethicalcloser.de/members/login?token=...' },
} satisfies TemplateEntry
