/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from 'npm:@react-email/components@0.0.22'
import { PRODUCT_BRAND } from '../product-config.ts'

interface MagicLinkEmailProps { siteName: string; confirmationUrl: string }

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Dein Login-Link für {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}><Text style={brand}>{PRODUCT_BRAND}</Text></Section>
        <Heading style={h1}>Dein Login-Link</Heading>
        <Text style={text}>Klicke auf den Button, um dich bei {siteName} einzuloggen. Der Link ist nur kurze Zeit gültig.</Text>
        <Button style={button} href={confirmationUrl}>Einloggen</Button>
        <Hr style={hr} />
        <Text style={footer}>Falls du diesen Link nicht angefordert hast, ignoriere diese E-Mail.</Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', margin: '0' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 6.7%)', margin: '0 0 16px' }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 40%)', lineHeight: '1.6', margin: '0 0 20px' }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: 'hsl(36, 33%, 95.3%)', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const hr = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '30px 0' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
