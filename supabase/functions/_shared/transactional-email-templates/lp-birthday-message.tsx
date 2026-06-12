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
    preview="Alles Gute zum Geburtstag"
    title="Alles Gute zum Geburtstag"
    greetingName={first_name}
    paragraphs={[
      'wir wünschen dir einen ruhigen, klaren Tag.',
      'Danke, dass du Teil von ETC bist.',
    ]}
    inlineLink={{ label: 'Plattform öffnen', url: platform_link }}
    closing="Herzlich"
  />
)

export const template = {
  component: Email,
  subject: 'Alles Gute zum Geburtstag',
  displayName: 'LP · Birthday Message',
  previewData: { first_name: 'Anna', platform_link: 'https://ethicalcloser.de/members/dashboard' },
} satisfies TemplateEntry
