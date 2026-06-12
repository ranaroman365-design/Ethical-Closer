/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface ApplicantAccessProps {
  name?: string
  email?: string
  magicLink?: string
  temporaryPassword?: string | null
  loginUrl?: string
}

const ApplicantAccessEmail = ({
  name = 'Bewerber',
  email = '',
  magicLink = 'https://ethicalcloser.de/members/login',
  temporaryPassword = null,
  loginUrl = 'https://ethicalcloser.de/members/login',
}: ApplicantAccessProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Dein Zugang zum Bewerberbereich</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
        </Section>

        <Heading style={h1}>
          {name}, dein Zugang ist aktiv.
        </Heading>

        <Text style={text}>
          Du kannst dich ab sofort in deinem persönlichen Bewerberbereich einloggen.
          Dort findest du alles zur Vorbereitung auf dein Gespräch.
        </Text>

        <Section style={buttonContainer}>
          <Button style={button} href={magicLink}>
            Direkt einloggen
          </Button>
        </Section>

        <Hr style={divider} />

        <Heading style={h2}>Deine Zugangsdaten</Heading>

        <Section style={infoBox}>
          <Text style={infoLabel}>E-Mail-Adresse</Text>
          <Text style={infoValue}>{email}</Text>
        </Section>

        {temporaryPassword && (
          <Section style={infoBox}>
            <Text style={infoLabel}>Temporäres Passwort</Text>
            <Text style={infoValueMono}>{temporaryPassword}</Text>
          </Section>
        )}

        <Text style={textSmall}>
          Falls der direkte Login nicht funktioniert, nutze die manuelle Anmeldung:
        </Text>
        <Text style={textSmall}>
          <Link href={loginUrl} style={linkStyle}>{loginUrl}</Link>
        </Text>

        <Hr style={divider} />

        <Heading style={h2}>Was dich erwartet</Heading>
        <Text style={listItem}>Dein persönlicher Karriereweg</Text>
        <Text style={listItem}>Vorbereitung auf dein Bewerbungsgespräch</Text>
        <Text style={listItem}>Exklusiver Einblick in die Plattform</Text>

        <Hr style={divider} />

        <Text style={hint}>
          Falls du diese Mail nicht findest, prüfe bitte auch deinen Spam-Ordner.
        </Text>

        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ApplicantAccessEmail,
  subject: 'Dein Zugang zum Bewerberbereich',
  displayName: 'Applicant access email (Login + Passwort)',
  previewData: {
    name: 'Max Mustermann',
    email: 'max@example.com',
    magicLink: 'https://ethicalcloser.de/members/dashboard?token=...',
    temporaryPassword: 'abc123def456!Aa1',
    loginUrl: 'https://ethicalcloser.de/members/login',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 12%)', margin: '0 0 16px', lineHeight: '1.3' }
const h2 = { fontSize: '15px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 12%)', margin: '0 0 12px' }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 35%)', lineHeight: '1.6', margin: '0 0 16px' }
const textSmall = { fontSize: '13px', color: 'hsl(0, 0%, 45%)', lineHeight: '1.5', margin: '0 0 8px' }
const listItem = { fontSize: '14px', color: 'hsl(0, 0%, 30%)', lineHeight: '1.7', margin: '0 0 4px' }
const infoBox = { backgroundColor: 'hsl(36, 33%, 95.3%)', borderRadius: '6px', padding: '16px 20px', margin: '0 0 12px' }
const infoLabel = { fontSize: '11px', color: 'hsl(0, 0%, 50%)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 2px', fontWeight: 'bold' as const }
const infoValue = { fontSize: '15px', color: 'hsl(0, 0%, 6.7%)', margin: '0', fontWeight: 'bold' as const }
const infoValueMono = { fontSize: '15px', color: 'hsl(0, 0%, 6.7%)', margin: '0', fontWeight: 'bold' as const, fontFamily: "'SF Mono', 'Fira Code', monospace" }
const buttonContainer = { textAlign: 'center' as const, margin: '24px 0' }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: '#f5f0eb', fontSize: '14px', borderRadius: '6px', padding: '14px 28px', textDecoration: 'none', fontWeight: 'bold' as const }
const linkStyle = { color: 'hsl(152, 30%, 27%)', textDecoration: 'underline' as const }
const divider = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '24px 0' }
const hint = { fontSize: '12px', color: 'hsl(0, 0%, 50%)', fontStyle: 'italic' as const, margin: '0 0 16px' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
