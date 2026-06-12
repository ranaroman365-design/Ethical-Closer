/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { LpShell } from './_lp-shell.tsx'

interface Props {
  name?: string
  /** One-shot magic download URL (24h TTL). Required in production. */
  downloadUrl?: string
  /** Permanent in-app fallback (login required). */
  inAppUrl?: string
}

const DEFAULT_INAPP = 'https://ethical-closing.lovable.app/members/playbooks/auszahlungspolitik'

const Email = ({
  name,
  downloadUrl = DEFAULT_INAPP,
  inAppUrl = DEFAULT_INAPP,
}: Props) => (
  <LpShell
    preview="Deine Auszahlungspolitik — direkter Zugriff"
    title="Auszahlungspolitik ETC v2"
    greetingName={name}
    paragraphs={[
      'mit dem Aufstieg in die Setter-Stufe wird ein Dokument für dich relevant: die offizielle Auszahlungspolitik.',
      'Sie regelt, wann Provisionen freigegeben werden, wie der Eligibility-Zeitraum funktioniert und welche Schritte jede Auszahlung durchläuft. Pflichtlektüre vor der ersten Provision.',
    ]}
    cta={{ label: 'Auszahlungspolitik ansehen', url: downloadUrl }}
  >
    <p style={{ fontSize: '13px', color: '#8C8C8C', lineHeight: '1.7', margin: '8px 0 0' }}>
      Der direkte Link ist 24 Stunden und einmalig gültig. Danach jederzeit
      verfügbar im Mitgliederbereich:
      {' '}
      <a href={inAppUrl} style={{ color: '#A88A35', textDecoration: 'underline' }}>
        Playbook im Mitgliederbereich öffnen
      </a>
      .
    </p>
  </LpShell>
)

export const template = {
  component: Email,
  subject: 'Deine Auszahlungspolitik — direkter Zugriff',
  displayName: 'LP · Playbook-Guide: Auszahlungspolitik',
  previewData: {
    name: 'Anna',
    downloadUrl: 'https://example.com/playbook-magic-redeem?token=demo',
    inAppUrl: DEFAULT_INAPP,
  },
} satisfies TemplateEntry
