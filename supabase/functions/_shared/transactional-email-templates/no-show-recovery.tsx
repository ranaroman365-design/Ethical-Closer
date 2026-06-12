/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface NoShowRecoveryProps {
  name?: string
  rescheduleUrl?: string
}

const NoShowRecoveryEmail = ({
  name,
  rescheduleUrl = 'https://ethical-closing.lovable.app/booking',
}: NoShowRecoveryProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Neuen Termin vereinbaren</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
        </Section>

        <Text style={intro}>
          {name ? `${name}, d` : 'D'}ein heutiger Termin konnte nicht stattfinden.
        </Text>

        <Text style={text}>
          Falls du weiterhin Interesse hast, kannst du hier einen neuen Termin wählen.
          Unsere Plätze sind begrenzt — sichere dir zeitnah einen passenden Slot.
        </Text>

        <Button style={button} href={rescheduleUrl}>
          Neuen Termin wählen
        </Button>

        <Hr style={divider} />

        <Text style={hint}>
          Bei Fragen erreichst du uns jederzeit über den Bewerberbereich.
        </Text>

        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: NoShowRecoveryEmail,
  subject: 'Neuen Termin vereinbaren',
  displayName: 'No-Show Recovery',
  previewData: {
    name: 'Anna Müller',
    rescheduleUrl: 'https://ethical-closing.lovable.app/booking?reschedule=abc123',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const intro = { fontSize: '16px', color: 'hsl(0, 0%, 12%)', lineHeight: '1.5', margin: '0 0 16px', fontWeight: 'bold' as const }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 35%)', lineHeight: '1.5', margin: '0 0 20px' }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: '#f5f0eb', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const divider = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '24px 0' }
const hint = { fontSize: '12px', color: 'hsl(0, 0%, 50%)', fontStyle: 'italic' as const, margin: '0 0 20px' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
