/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface SetterAssignedProps {
  setterName?: string
  leadName?: string
  appointmentDate?: string
  appointmentTime?: string
  callType?: string
  funnelSource?: string
  leadWorkspaceUrl?: string
  isOwnerCopy?: boolean
}

const SetterAssignedEmail = ({
  setterName,
  leadName = 'Neuer Lead',
  appointmentDate = '',
  appointmentTime = '',
  callType = 'Standard',
  funnelSource,
  leadWorkspaceUrl = 'https://ethical-closing.lovable.app/members/setter',
  isOwnerCopy = false,
}: SetterAssignedProps) => {
  const isPriority = callType?.toLowerCase().includes('priority')
  const timeDisplay = appointmentDate
    ? `${appointmentDate} um ${appointmentTime}`
    : 'In Kürze'

  return (
    <Html lang="de" dir="ltr">
      <Head />
      <Preview>
        {isPriority
          ? `PRIORITY TERMIN – sofort prüfen (${appointmentTime})`
          : `Neuer Termin – ${timeDisplay}`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>{SITE_NAME}</Text>
          </Section>

          {isOwnerCopy && (
            <Section style={ownerBadge}>
              <Text style={ownerBadgeText}>OWNER KOPIE</Text>
            </Section>
          )}

          <Text style={intro}>
            {isOwnerCopy
              ? 'Neuer Termin wurde gebucht und zugewiesen.'
              : 'Neuer Termin wurde dir zugewiesen.'}
          </Text>

          <Section style={infoBox}>
            <Text style={infoLabel}>Lead</Text>
            <Text style={infoValue}>{leadName}</Text>
            <Text style={infoLabel}>Termin</Text>
            <Text style={infoValue}>{timeDisplay}</Text>
            <Text style={infoLabel}>Typ</Text>
            <Text style={infoValue}>
              {isPriority ? '🔴 PRIORITY' : 'Standard'}
            </Text>
            {isOwnerCopy && setterName && (
              <>
                <Text style={infoLabel}>Setter</Text>
                <Text style={infoValue}>{setterName}</Text>
              </>
            )}
            {funnelSource && (
              <>
                <Text style={infoLabel}>Quelle</Text>
                <Text style={infoValue}>{funnelSource}</Text>
              </>
            )}
          </Section>

          {!isOwnerCopy && (
            <>
              <Section style={actionBox}>
                <Text style={actionTitle}>Bitte jetzt:</Text>
                <Text style={actionStep}>1. Lead im Bewerberbereich öffnen</Text>
                <Text style={actionStep}>2. Antworten kurz prüfen</Text>
                <Text style={actionStep}>3. Gespräch vorbereiten</Text>
              </Section>

              <Button style={button} href={leadWorkspaceUrl}>
                Direkt zum Lead
              </Button>

              <Hr style={hr} />
              <Text style={responsibility}>
                Dieser Termin liegt jetzt in deiner Verantwortung.
              </Text>
              <Text style={responsibility}>
                Bitte bestätige und bereite dich rechtzeitig vor.
              </Text>
            </>
          )}

          {isOwnerCopy && (
            <Button style={button} href={leadWorkspaceUrl}>
              Direkt öffnen
            </Button>
          )}

          <Hr style={hr} />
          <Text style={footer}>{SITE_NAME}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: SetterAssignedEmail,
  subject: (data: Record<string, any>) => {
    const isPriority = data?.callType?.toLowerCase().includes('priority')
    if (data?.isOwnerCopy) {
      return `Termin gebucht – ${data?.appointmentTime || ''} – ${data?.setterName || 'Setter'}`
    }
    return isPriority
      ? `PRIORITY TERMIN – sofort prüfen (${data?.appointmentTime ? 'heute ' + data.appointmentTime : 'jetzt'})`
      : `Neuer Termin – ${data?.appointmentDate || ''} ${data?.appointmentTime || ''}`
  },
  displayName: 'Setter-Termin-Zuweisung',
  previewData: {
    setterName: 'Max',
    leadName: 'Anna Müller',
    appointmentDate: '15. Januar 2025',
    appointmentTime: '14:30',
    callType: 'Priority Strategiegespräch',
    funnelSource: 'Income Funnel',
    leadWorkspaceUrl: 'https://ethical-closing.lovable.app/members/setter',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const ownerBadge = { backgroundColor: 'hsl(40, 40%, 94%)', borderRadius: '4px', padding: '6px 12px', margin: '0 0 16px', textAlign: 'center' as const }
const ownerBadgeText = { fontSize: '11px', fontWeight: 'bold' as const, color: 'hsl(36, 32%, 42%)', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0' }
const intro = { fontSize: '15px', color: 'hsl(0, 0%, 20%)', lineHeight: '1.5', margin: '0 0 20px' }
const infoBox = { backgroundColor: 'hsl(36, 33%, 95.3%)', borderRadius: '6px', padding: '16px 20px', margin: '0 0 24px' }
const infoLabel = { fontSize: '11px', color: 'hsl(0, 0%, 50%)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 2px', fontWeight: 'bold' as const }
const infoValue = { fontSize: '15px', color: 'hsl(0, 0%, 6.7%)', margin: '0 0 12px', fontWeight: 'bold' as const }
const actionBox = { margin: '0 0 24px' }
const actionTitle = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 12%)', margin: '0 0 8px' }
const actionStep = { fontSize: '14px', color: 'hsl(0, 0%, 30%)', margin: '0 0 4px', lineHeight: '1.6' }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: '#f5f0eb', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const hr = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '24px 0' }
const responsibility = { fontSize: '13px', color: 'hsl(0, 0%, 30%)', margin: '0 0 4px', fontStyle: 'italic' as const }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
