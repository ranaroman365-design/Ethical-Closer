/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface BookingConfirmationProps {
  name?: string
  date?: string
  time?: string
  callType?: string
  loginUrl?: string
  meetingLink?: string
  googleCalendarUrl?: string
  outlookCalendarUrl?: string
  icsUrl?: string
  durationMinutes?: number
  agenda?: string[]
  bringList?: string[]
}

const DEFAULT_AGENDA = [
  'Kurzes Kennenlernen & deine aktuelle Situation (5 Min)',
  'Deine Ziele, Voraussetzungen und realistischer Fit (15 Min)',
  'Ehrliche Einschätzung & nächste Schritte — beidseitig (10 Min)',
]

const DEFAULT_BRING = [
  'Ruhige Umgebung, stabile Internetverbindung, Headset',
  'Stift & Notizmöglichkeit',
  'Klarheit über deine wichtigsten Fragen',
]


const BookingConfirmationEmail = ({
  name,
  date = '',
  time,
  callType = 'Strategiegespräch',
  loginUrl = 'https://ethical-closing.lovable.app/members/login',
  meetingLink,
  googleCalendarUrl,
  outlookCalendarUrl,
  icsUrl,
  durationMinutes = 30,
  agenda = DEFAULT_AGENDA,
  bringList = DEFAULT_BRING,
}: BookingConfirmationProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Dein Termin ist bestätigt</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
        </Section>

        <Text style={intro}>
          {name ? `${name}, d` : 'D'}ein Termin ist bestätigt.
        </Text>

        <Section style={infoBox}>
          <Text style={infoLabel}>Datum</Text>
          <Text style={infoValue}>{date}{time ? ` um ${time}` : ''}</Text>
          <Text style={infoLabel}>Typ</Text>
          <Text style={infoValue}>{callType}</Text>
          <Text style={infoLabel}>Dauer</Text>
          <Text style={infoValue}>{durationMinutes} Minuten</Text>
        </Section>

        {meetingLink ? (
          <Section style={infoBox}>
            <Text style={infoLabel}>Meeting-Link</Text>
            <Text style={infoValue}><a href={meetingLink} style={linkStyle}>{meetingLink}</a></Text>
          </Section>
        ) : null}

        <Text style={text}>
          Wir melden uns rechtzeitig bei dir.
        </Text>

        {agenda && agenda.length > 0 ? (
          <Section style={accessBox}>
            <Text style={accessTitle}>Ablauf des Gesprächs</Text>
            {agenda.map((item, i) => (
              <Text key={`a-${i}`} style={accessText}>• {item}</Text>
            ))}
          </Section>
        ) : null}

        {bringList && bringList.length > 0 ? (
          <Section style={accessBox}>
            <Text style={accessTitle}>Was du mitbringen solltest</Text>
            {bringList.map((item, i) => (
              <Text key={`b-${i}`} style={accessText}>• {item}</Text>
            ))}
          </Section>
        ) : null}

        {(googleCalendarUrl || outlookCalendarUrl || icsUrl) ? (
          <Section style={accessBox}>
            <Text style={accessTitle}>Termin in Kalender speichern:</Text>
            {googleCalendarUrl ? <Text style={accessText}>• <a href={googleCalendarUrl} style={linkStyle}>Google Kalender</a></Text> : null}
            {outlookCalendarUrl ? <Text style={accessText}>• <a href={outlookCalendarUrl} style={linkStyle}>Outlook</a></Text> : null}
            {icsUrl ? <Text style={accessText}>• <a href={icsUrl} style={linkStyle}>Kalenderdatei (.ics) herunterladen</a></Text> : null}
          </Section>
        ) : null}

        <Hr style={divider} />

        <Section style={accessBox}>
          <Text style={accessTitle}>Wichtig:</Text>
          <Text style={accessText}>
            Du hast bereits Zugang zu deinem Bewerberbereich erhalten.
          </Text>
          <Text style={accessText}>
            Bitte nutze diesen, um dich optimal vorzubereiten.
          </Text>
        </Section>

        <Button style={button} href={loginUrl}>
          Zum Bewerberbereich
        </Button>

        <Hr style={divider} />

        <Section style={accessBox}>
          <Text style={accessTitle}>Termin verschieben?</Text>
          <Text style={accessText}>
            Falls du den Termin verschieben musst, kannst du das jederzeit über deinen{' '}
            <a href={loginUrl} style={linkStyle}>Bewerberbereich</a> tun.
          </Text>
        </Section>

        <Text style={hint}>
          Falls du keine Zugangsmail findest, prüfe bitte auch deinen Spam-Ordner.
        </Text>

        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BookingConfirmationEmail,
  subject: 'Dein Termin ist bestätigt',
  displayName: 'Terminbestätigung',
  previewData: {
    name: 'Anna',
    date: '15. Januar 2026',
    time: '14:00',
    callType: 'Strategiegespräch',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const intro = { fontSize: '16px', color: 'hsl(0, 0%, 12%)', lineHeight: '1.5', margin: '0 0 20px', fontWeight: 'bold' as const }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 35%)', lineHeight: '1.5', margin: '0 0 16px' }
const infoBox = { backgroundColor: 'hsl(36, 33%, 95.3%)', borderRadius: '6px', padding: '16px 20px', margin: '0 0 20px' }
const infoLabel = { fontSize: '11px', color: 'hsl(0, 0%, 50%)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 2px', fontWeight: 'bold' as const }
const infoValue = { fontSize: '15px', color: 'hsl(0, 0%, 6.7%)', margin: '0 0 12px', fontWeight: 'bold' as const }
const divider = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '20px 0' }
const accessBox = { margin: '0 0 20px' }
const accessTitle = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 12%)', margin: '0 0 6px' }
const accessText = { fontSize: '14px', color: 'hsl(0, 0%, 30%)', margin: '0 0 4px', lineHeight: '1.5' }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: '#f5f0eb', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const hint = { fontSize: '12px', color: 'hsl(0, 0%, 50%)', fontStyle: 'italic' as const, margin: '0 0 20px' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
const linkStyle = { color: 'hsl(152, 30%, 27%)', textDecoration: 'underline' as const }
