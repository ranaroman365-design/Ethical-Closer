/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface Lead24hProps {
  name?: string
  date?: string
  time?: string
  callType?: string
  loginUrl?: string
}

const LeadReminder24hEmail = ({
  name,
  date = '',
  time = '',
  callType = 'Strategiegespräch',
  loginUrl = 'https://ethical-closing.lovable.app/members/interview',
}: Lead24hProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Dein Termin ist morgen — kurze Klarheit zur Vorbereitung</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
        </Section>

        <Heading style={h1}>
          {name ? `${name}, dein Call ist morgen.` : 'Dein Call ist morgen.'}
        </Heading>

        <Section style={infoBox}>
          <Text style={infoLabel}>Termin</Text>
          <Text style={infoValue}>{date}{time ? ` · ${time}` : ''}</Text>
          <Text style={infoLabel}>Typ</Text>
          <Text style={infoValue}>{callType}</Text>
        </Section>

        <Text style={text}>
          Damit der Call wirklich etwas verändert, brauchst du nur drei Dinge:
        </Text>
        <Text style={listItem}>1. Eine ruhige Umgebung — kein Multitasking.</Text>
        <Text style={listItem}>2. Stift und Zettel.</Text>
        <Text style={listItem}>3. Ehrliche Antworten auf zwei Fragen: Wo stehst du? Wo willst du in 90 Tagen sein?</Text>

        <Button style={button} href={loginUrl}>
          Vorbereitung öffnen
        </Button>

        <Hr style={divider} />

        <Text style={hint}>
          Wenn du nicht teilnehmen kannst, sag bitte rechtzeitig ab — Plätze sind begrenzt.
        </Text>

        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: LeadReminder24hEmail,
  subject: 'Dein Call ist morgen — kurze Vorbereitung',
  displayName: 'Lead-Reminder T-24h (Klarheit)',
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
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 12%)', margin: '0 0 18px', lineHeight: '1.3' }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 30%)', lineHeight: '1.6', margin: '0 0 10px' }
const listItem = { fontSize: '14px', color: 'hsl(0, 0%, 25%)', lineHeight: '1.6', margin: '0 0 6px' }
const infoBox = { backgroundColor: 'hsl(36, 33%, 95.3%)', borderRadius: '6px', padding: '16px 20px', margin: '0 0 20px' }
const infoLabel = { fontSize: '11px', color: 'hsl(0, 0%, 50%)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 2px', fontWeight: 'bold' as const }
const infoValue = { fontSize: '15px', color: 'hsl(0, 0%, 6.7%)', margin: '0 0 12px', fontWeight: 'bold' as const }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: '#f5f0eb', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const, margin: '8px 0 4px' }
const divider = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '24px 0 16px' }
const hint = { fontSize: '12px', color: 'hsl(0, 0%, 50%)', fontStyle: 'italic' as const, margin: '0 0 20px' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
