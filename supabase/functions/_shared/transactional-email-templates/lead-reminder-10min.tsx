/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface Lead10minProps {
  name?: string
  callType?: string
  joinUrl?: string
}

const LeadReminder10minEmail = ({
  name,
  callType = 'Strategiegespräch',
  joinUrl = 'https://ethical-closing.lovable.app/members/interview',
}: Lead10minProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>In 10 Minuten: Dein {callType}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
        </Section>

        <Heading style={h1}>
          {name ? `${name}, gleich geht es los.` : 'Gleich geht es los.'}
        </Heading>

        <Text style={text}>
          Kurzer Check vor deinem {callType}:
        </Text>
        <Text style={listItem}>Ruhiger Raum, Tür zu</Text>
        <Text style={listItem}>Kopfhörer und stabile Verbindung</Text>
        <Text style={listItem}>Stift, Zettel, Wasser</Text>

        <Button style={button} href={joinUrl}>
          Jetzt zum Call
        </Button>

        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: LeadReminder10minEmail,
  subject: 'In 10 Minuten geht es los',
  displayName: 'Lead-Reminder T-10min (Aktivierung)',
  previewData: {
    name: 'Anna Müller',
    callType: 'Strategiegespräch',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 12%)', margin: '0 0 14px', lineHeight: '1.3' }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 30%)', lineHeight: '1.6', margin: '0 0 8px' }
const listItem = { fontSize: '14px', color: 'hsl(0, 0%, 25%)', lineHeight: '1.7', margin: '0 0 4px' }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: '#f5f0eb', fontSize: '15px', borderRadius: '6px', padding: '14px 28px', textDecoration: 'none', fontWeight: 'bold' as const, margin: '18px 0 24px' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
