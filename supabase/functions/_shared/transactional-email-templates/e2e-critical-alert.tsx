import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Ethical Closing'

interface E2ECriticalAlertProps {
  score?: number
  failedCritical?: number
  failedWarning?: number
  total?: number
  failingChecks?: Array<{ name: string; severity: string; detail: string; category?: string }>
  runId?: string
  ranAt?: string
  dashboardUrl?: string
}

const E2ECriticalAlertEmail = ({
  score = 0,
  failedCritical = 0,
  failedWarning = 0,
  total = 0,
  failingChecks = [],
  runId,
  ranAt,
  dashboardUrl,
}: E2ECriticalAlertProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>{`🚨 E2E-Status CRITICAL · Score ${score}/100 · ${failedCritical} kritische Fehler`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>🚨 E2E-System-Check: CRITICAL</Heading>

        <Section style={statBox}>
          <Text style={statLine}>
            <strong>Score:</strong> {score}/100
          </Text>
          <Text style={statLine}>
            <strong>Kritische Fehler:</strong> {failedCritical}
          </Text>
          <Text style={statLine}>
            <strong>Warnungen:</strong> {failedWarning}
          </Text>
          <Text style={statLine}>
            <strong>Checks gesamt:</strong> {total}
          </Text>
          {ranAt && (
            <Text style={statLine}>
              <strong>Zeitpunkt:</strong> {ranAt}
            </Text>
          )}
        </Section>

        <Hr style={hr} />

        <Heading style={h2}>Failing Checks</Heading>
        {failingChecks.length === 0 ? (
          <Text style={text}>—</Text>
        ) : (
          failingChecks.map((c, i) => (
            <Section key={i} style={checkBox}>
              <Text style={checkName}>
                {c.severity === 'critical' ? '🔴' : '🟡'} {c.name}
                {c.category && <span style={catTag}> · {c.category}</span>}
              </Text>
              <Text style={checkDetail}>{c.detail}</Text>
            </Section>
          ))
        )}

        {dashboardUrl && (
          <>
            <Hr style={hr} />
            <Text style={text}>
              Details im Admin-Dashboard öffnen: <a href={dashboardUrl} style={link}>{dashboardUrl}</a>
            </Text>
          </>
        )}

        {runId && <Text style={footer}>Run-ID: {runId}</Text>}
        <Text style={footer}>Automatischer Alert · {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: E2ECriticalAlertEmail,
  subject: (data: Record<string, any>) =>
    `🚨 E2E CRITICAL · Score ${data?.score ?? '?'}/100 · ${data?.failedCritical ?? '?'} kritische Fehler`,
  displayName: 'E2E Critical Alert',
  previewData: {
    score: 42,
    failedCritical: 3,
    failedWarning: 2,
    total: 18,
    failingChecks: [
      { name: 'Pipeline-Verknüpfung lesbar', severity: 'critical', detail: '5 verwaiste Termine', category: 'pipeline' },
      { name: 'Email-Failure-Rate', severity: 'critical', detail: '12% > 5%', category: 'email' },
    ],
    runId: 'abc-123',
    ranAt: new Date().toISOString(),
    dashboardUrl: 'https://ethicalcloser.de/members/admin/e2e-checks',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#b91c1c', margin: '0 0 16px' }
const h2 = { fontSize: '16px', fontWeight: 'bold', color: '#000000', margin: '20px 0 10px' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '1.5', margin: '0 0 12px' }
const statBox = { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px 16px', margin: '0 0 16px' }
const statLine = { fontSize: '13px', color: '#374151', margin: '4px 0' }
const checkBox = { backgroundColor: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '10px 12px', margin: '0 0 8px' }
const checkName = { fontSize: '13px', fontWeight: 'bold', color: '#111827', margin: '0 0 4px' }
const checkDetail = { fontSize: '12px', color: '#6b7280', margin: '0' }
const catTag = { fontWeight: 'normal', color: '#9ca3af', fontSize: '11px' }
const hr = { borderColor: '#e5e7eb', margin: '20px 0' }
const link = { color: '#2563eb', textDecoration: 'underline' }
const footer = { fontSize: '11px', color: '#9ca3af', margin: '8px 0 0' }
