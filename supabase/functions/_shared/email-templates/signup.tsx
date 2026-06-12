/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import { PRODUCT_BRAND } from '../product-config.ts'

interface SignupEmailProps { siteName: string; siteUrl: string; recipient: string; confirmationUrl: string }

export const SignupEmail = ({ siteName, siteUrl, recipient, confirmationUrl }: SignupEmailProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Bestätige deine E-Mail für {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}><Text style={brand}>{PRODUCT_BRAND}</Text></Section>
        <Heading style={h1}>E-Mail bestätigen</Heading>
        <Text style={text}>
          Danke für deine Registrierung bei{' '}
          <Link href={siteUrl} style={link}><strong>{siteName}</strong></Link>!
        </Text>
        <Text style={text}>
          Bitte bestätige deine E-Mail-Adresse (<Link href={`mailto:${recipient}`} style={link}>{recipient}</Link>):
        </Text>
        <Button style={button} href={confirmationUrl}>E-Mail bestätigen</Button>
        <Hr style={hr} />
        <Text style={footer}>Falls du kein Konto erstellt hast, kannst du diese E-Mail ignorieren.</Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', margin: '0' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 6.7%)', margin: '0 0 16px' }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 40%)', lineHeight: '1.6', margin: '0 0 20px' }
const link = { color: 'inherit', textDecoration: 'underline' }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: 'hsl(36, 33%, 95.3%)', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const hr = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '30px 0' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
