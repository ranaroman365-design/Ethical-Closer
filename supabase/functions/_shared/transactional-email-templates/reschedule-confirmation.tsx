/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface RescheduleConfirmationProps {
  name?: string
  oldDate?: string
  oldTime?: string
  newDate?: string
  newTime?: string
  callType?: string
  googleCalendarUrl?: string
  outlookCalendarUrl?: string
  meetingLink?: string
}

const RescheduleConfirmationEmail = ({
  name = 'Bewerber',
  oldDate,
  oldTime,
  newDate = '',
  newTime = '',
  callType = 'Strategiegespräch',
  googleCalendarUrl,
  outlookCalendarUrl,
  meetingLink,
}: RescheduleConfirmationProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Dein Termin wurde verschoben – neuer Termin bestätigt</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
        </Section>

        <Text style={intro}>
          {name}, dein Termin wurde erfolgreich verschoben.
        </Text>

        {oldDate && oldTime && (
          <Section style={infoBoxMuted}>
            <Text style={infoLabel}>Alter Termin (storniert)</Text>
            <Text style={infoValueMuted}>{oldDate} um {oldTime} Uhr</Text>
          </Section>
        )}

        <Section style={infoBox}>
          <Text style={infoLabel}>Neuer Termin</Text>
          <Text style={infoValue}>{newDate} um {newTime} Uhr</Text>
          <Text style={{ ...infoLabel, marginTop: '8px' }}>Typ</Text>
          <Text style={infoValue}>{callType}</Text>
        </Section>

        {meetingLink ? (
          <Section style={accessBox}>
            <Text style={accessTitle}>Meeting-Link</Text>
            <Text style={accessText}>
              <a href={meetingLink} style={linkStyle}>{meetingLink}</a>
            </Text>
          </Section>
        ) : null}

        {(googleCalendarUrl || outlookCalendarUrl) ? (
          <Section style={accessBox}>
            <Text style={accessTitle}>Neuen Termin im Kalender speichern:</Text>
            {googleCalendarUrl ? <Text style={accessText}>• <a href={googleCalendarUrl} style={linkStyle}>Google Kalender</a></Text> : null}
            {outlookCalendarUrl ? <Text style={accessText}>• <a href={outlookCalendarUrl} style={linkStyle}>Outlook</a></Text> : null}
          </Section>
        ) : null}

        <Text style={text}>
          Bitte erscheine pünktlich zu deinem neuen Termin. Dein Ansprechpartner ist bereits informiert.
        </Text>

        <Section style={buttonContainer}>
          <Button style={button} href="https://ethicalcloser.de/members/dashboard">
            Zum Bewerberbereich
          </Button>
        </Section>

        <Hr style={divider} />

        <Text style={hint}>
          Falls du diese Mail nicht in deinem Posteingang findest, prüfe bitte auch deinen Spam-Ordner.
        </Text>

        <Text style={footer}>
          {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RescheduleConfirmationEmail,
  subject: 'Dein Termin wurde verschoben – neuer Termin bestätigt',
  displayName: 'Umbuchungsbestätigung',
  previewData: {
    name: 'Max Mustermann',
    oldDate: '15. April 2026',
    oldTime: '14:00',
    newDate: '17. April 2026',
    newTime: '10:00',
    callType: 'Strategiegespräch',
    googleCalendarUrl: 'https://calendar.google.com/calendar/event?action=TEMPLATE',
    outlookCalendarUrl: 'https://outlook.live.com/calendar/0/deeplink/compose',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const intro = { fontSize: '16px', color: 'hsl(0, 0%, 12%)', lineHeight: '1.5', margin: '0 0 20px', fontWeight: 'bold' as const }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 35%)', lineHeight: '1.5', margin: '0 0 16px' }
const infoBox = { backgroundColor: '#f0fdf4', borderRadius: '6px', padding: '16px 20px', margin: '0 0 20px', border: '1px solid #bbf7d0' }
const infoBoxMuted = { backgroundColor: 'hsl(36, 33%, 95.3%)', borderRadius: '6px', padding: '16px 20px', margin: '0 0 12px', opacity: 0.7 }
const infoLabel = { fontSize: '11px', color: 'hsl(0, 0%, 50%)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 2px', fontWeight: 'bold' as const }
const infoValue = { fontSize: '15px', color: 'hsl(0, 0%, 6.7%)', margin: '0 0 12px', fontWeight: 'bold' as const }
const infoValueMuted = { fontSize: '14px', color: 'hsl(0, 0%, 50%)', fontWeight: '500' as const, margin: '0', textDecoration: 'line-through' as const }
const accessBox = { margin: '0 0 20px' }
const accessTitle = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 12%)', margin: '0 0 6px' }
const accessText = { fontSize: '14px', color: 'hsl(0, 0%, 30%)', margin: '0 0 4px', lineHeight: '1.5' }
const linkStyle = { color: 'hsl(152, 30%, 27%)', textDecoration: 'underline' as const }
const buttonContainer = { textAlign: 'center' as const, margin: '24px 0' }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: '#f5f0eb', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const divider = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '24px 0' }
const hint = { fontSize: '12px', color: 'hsl(0, 0%, 50%)', fontStyle: 'italic' as const, margin: '0 0 16px' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
