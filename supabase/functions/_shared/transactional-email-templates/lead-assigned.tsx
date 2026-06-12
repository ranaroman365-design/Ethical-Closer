/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface LeadAssignedProps {
  assigneeName?: string
  leadName?: string
  leadLevel?: string
  role?: string
  dashboardUrl?: string
}

const LeadAssignedEmail = ({
  assigneeName,
  leadName = 'Neuer Lead',
  leadLevel = 'L0',
  role = 'Setter',
  dashboardUrl = 'https://ethical-closing.lovable.app/members/setter',
}: LeadAssignedProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Neuer Lead zugewiesen – {leadName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
        </Section>
        <Heading style={h1}>
          {assigneeName ? `Hallo ${assigneeName},` : 'Hallo,'}
        </Heading>
        <Text style={text}>
          Dir wurde ein neuer Lead zugewiesen:
        </Text>
        <Section style={infoBox}>
          <Text style={infoLabel}>Lead</Text>
          <Text style={infoValue}>{leadName}</Text>
          <Text style={infoLabel}>Level</Text>
          <Text style={infoValue}>{leadLevel}</Text>
          <Text style={infoLabel}>Deine Rolle</Text>
          <Text style={infoValue}>{role}</Text>
        </Section>
        <Text style={text}>
          Bitte kontaktiere den Lead zeitnah. Dein SLA-Timer läuft.
        </Text>
        <Button style={button} href={dashboardUrl}>
          Zum Workspace
        </Button>
        <Hr style={hr} />
        <Text style={footer}>
          Diese E-Mail wurde automatisch von {SITE_NAME} versendet.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: LeadAssignedEmail,
  subject: (data: Record<string, any>) =>
    `Neuer Lead zugewiesen: ${data?.leadName || 'Lead'}`,
  displayName: 'Lead-Zuweisung',
  previewData: {
    assigneeName: 'Max',
    leadName: 'Anna Müller',
    leadLevel: 'L0',
    role: 'Setter',
    dashboardUrl: 'https://ethical-closing.lovable.app/members/setter',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 6.7%)', margin: '0 0 16px' }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 40%)', lineHeight: '1.6', margin: '0 0 20px' }
const infoBox = { backgroundColor: 'hsl(36, 33%, 95.3%)', borderRadius: '6px', padding: '16px 20px', margin: '0 0 24px' }
const infoLabel = { fontSize: '11px', color: 'hsl(0, 0%, 40%)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 2px', fontWeight: 'bold' as const }
const infoValue = { fontSize: '15px', color: 'hsl(0, 0%, 6.7%)', margin: '0 0 12px' }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: 'hsl(36, 33%, 95.3%)', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const hr = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '30px 0' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
