/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Link, Preview, Text, Section, Hr } from 'npm:@react-email/components@0.0.22'
import { PRODUCT_BRAND } from '../product-config.ts'

interface EmailChangeEmailProps { siteName: string; email: string; newEmail: string; confirmationUrl: string }

export const EmailChangeEmail = ({ siteName, email, newEmail, confirmationUrl }: EmailChangeEmailProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>E-Mail-Änderung bestätigen für {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}><Text style={brand}>{PRODUCT_BRAND}</Text></Section>
        <Heading style={h1}>E-Mail-Änderung bestätigen</Heading>
        <Text style={text}>
          Du hast eine Änderung deiner E-Mail-Adresse für {siteName} angefordert: von{' '}
          <Link href={`mailto:${email}`} style={link}>{email}</Link> zu{' '}
          <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
        </Text>
        <Button style={button} href={confirmationUrl}>Änderung bestätigen</Button>
        <Hr style={hr} />
        <Text style={footer}>Falls du das nicht angefordert hast, sichere bitte sofort dein Konto.</Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

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
