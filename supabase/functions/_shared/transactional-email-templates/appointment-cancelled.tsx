/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface AppointmentCancelledProps {
  name?: string
  date?: string
  time?: string
  callType?: string
  rebookUrl?: string
}

const AppointmentCancelledEmail = ({
  name,
  date,
  time,
  callType = 'Strategiegespräch',
  rebookUrl = 'https://ethicalcloser.de/book',
}: AppointmentCancelledProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Dein Termin wurde storniert</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
        </Section>

        <Text style={intro}>
          {name ? `${name}, d` : 'D'}ein Termin wurde storniert.
        </Text>

        {(date || time) ? (
          <Section style={infoBoxMuted}>
            <Text style={infoLabel}>Stornierter Termin</Text>
            <Text style={infoValueMuted}>
              {date}{time ? ` um ${time} Uhr` : ''}
            </Text>
            <Text style={infoLabel}>Typ</Text>
            <Text style={infoValueMuted}>{callType}</Text>
          </Section>
        ) : null}

        <Text style={text}>
          Dein Termin wurde erfolgreich storniert. Falls du weiterhin Interesse hast, kannst du jederzeit einen neuen Termin buchen:
        </Text>

        <Section style={buttonContainer}>
          <Button style={button} href={rebookUrl}>
            Neuen Termin buchen
          </Button>
        </Section>

        <Hr style={divider} />
        <Text style={hint}>
          Falls du Fragen hast, kannst du dich jederzeit an uns wenden.
        </Text>
        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AppointmentCancelledEmail,
  subject: 'Dein Termin wurde storniert',
  displayName: 'Terminstornierung',
  previewData: {
    name: 'Anna Müller',
    date: '15. Januar 2026',
    time: '14:00',
    callType: 'Strategiegespräch',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const intro = { fontSize: '16px', color: 'hsl(0, 0%, 12%)', lineHeight: '1.5', margin: '0 0 16px', fontWeight: 'bold' as const }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 35%)', lineHeight: '1.5', margin: '0 0 20px' }
const infoBoxMuted = { backgroundColor: 'hsl(36, 33%, 95.3%)', borderRadius: '6px', padding: '16px 20px', margin: '0 0 20px', opacity: 0.7 }
const infoLabel = { fontSize: '11px', color: 'hsl(0, 0%, 50%)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 2px', fontWeight: 'bold' as const }
const infoValueMuted = { fontSize: '15px', color: 'hsl(0, 0%, 40%)', margin: '0 0 12px', fontWeight: 'bold' as const, textDecoration: 'line-through' as const }
const buttonContainer = { textAlign: 'center' as const, margin: '24px 0' }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: '#f5f0eb', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const divider = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '24px 0' }
const hint = { fontSize: '12px', color: 'hsl(0, 0%, 50%)', fontStyle: 'italic' as const, margin: '0 0 16px' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
