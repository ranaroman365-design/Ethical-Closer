/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  name?: string
  link?: string
}

const Email = ({ name, link = 'https://ethical-closing.lovable.app/members/dashboard' }: Props) => (
  <LpShell
    preview="Kurzes Update zu deinem Fortschritt"
    greetingName={name}
    paragraphs={[
      'kurzes Update zu deinem Fortschritt.',
      'Du bist auf einem guten Weg.',
      'Wenn du den nächsten Schritt gehen willst, findest du hier die relevanten Punkte:',
    ]}
    inlineLink={{ label: 'Zu den nächsten Punkten', url: link }}
  />
)

export const template = {
  component: Email,
  subject: 'Kurzes Update',
  displayName: 'LP · Progress / Motivation',
  previewData: { name: 'Anna' },
} satisfies TemplateEntry
