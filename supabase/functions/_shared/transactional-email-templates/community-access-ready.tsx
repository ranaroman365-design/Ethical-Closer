/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface CommunityAccessReadyProps {
  name?: string
  email?: string
  communityLink?: string
}

const CommunityAccessReadyEmail = ({
  name = 'Mitglied',
  email = '',
  communityLink = 'https://ethical-closing.lovable.app/community/feed',
}: CommunityAccessReadyProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Dein Zugang zur {SITE_NAME} Community ist aktiv</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          Willkommen in der {SITE_NAME} Community, {name}!
        </Heading>

        <Text style={text}>
          Deine Zahlung ist eingegangen und dein Zugang zur Community ist jetzt vollständig freigeschaltet. Du kannst sofort loslegen.
        </Text>

        <Section style={infoBox}>
          <Text style={infoLabel}>Dein Zugang</Text>
          <Text style={infoValue}>{email}</Text>
        </Section>

        <Section style={buttonContainer}>
          <Button style={button} href={communityLink}>
            Jetzt zur Community
          </Button>
        </Section>

        <Hr style={hr} />

        <Heading style={h2}>Was dich drinnen erwartet:</Heading>
        <Text style={text}>
          • Tägliche Drops & Updates aus der Praxis{'\n'}
          • Spaces für Setter, Closer & Operatoren{'\n'}
          • Direkter Austausch mit anderen Mitgliedern
        </Text>

        <Hr style={hr} />

        <Text style={footerText}>
          📧 Falls du diese Mail nicht in deinem Posteingang findest, prüfe bitte auch deinen Spam-Ordner.
        </Text>

        <Text style={footer}>
          Mit besten Grüßen,{'\n'}
          Dein {SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CommunityAccessReadyEmail,
  subject: `Dein Zugang zur ${SITE_NAME} Community ist aktiv`,
  displayName: 'Community access ready',
  previewData: {
    name: 'Max Mustermann',
    email: 'max@example.com',
    communityLink: 'https://ethical-closing.lovable.app/community/feed',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '24px 28px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#1a1a2e', margin: '0 0 20px', lineHeight: '1.3' }
const h2 = { fontSize: '16px', fontWeight: '600' as const, color: '#1a1a2e', margin: '0 0 12px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 16px', whiteSpace: 'pre-line' as const }
const infoBox = { backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '16px', margin: '0 0 20px' }
const infoLabel = { fontSize: '12px', color: '#888', margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const infoValue = { fontSize: '16px', color: '#1a1a2e', fontWeight: '600' as const, margin: '0' }
const buttonContainer = { textAlign: 'center' as const, margin: '24px 0' }
const button = {
  backgroundColor: '#D4AF37',
  color: '#1a1a2e',
  padding: '14px 28px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footerText = { fontSize: '13px', color: '#888', lineHeight: '1.5', margin: '0 0 16px' }
const footer = { fontSize: '13px', color: '#999', margin: '24px 0 0', whiteSpace: 'pre-line' as const }
