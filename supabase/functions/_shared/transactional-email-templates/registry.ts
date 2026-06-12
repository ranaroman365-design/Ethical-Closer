/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as leadAssigned } from './lead-assigned.tsx'
import { template as bookingConfirmation } from './booking-confirmation.tsx'
import { template as statusChange } from './status-change.tsx'
import { template as appointmentReminder } from './appointment-reminder.tsx'
import { template as setterAssigned } from './setter-assigned.tsx'
import { template as setterReminder } from './setter-reminder.tsx'
import { template as slaEscalation } from './sla-escalation.tsx'
import { template as leadReminder } from './lead-reminder.tsx'
import { template as leadReminder24h } from './lead-reminder-24h.tsx'
import { template as leadReminder10min } from './lead-reminder-10min.tsx'
import { template as noShowRecovery } from './no-show-recovery.tsx'
import { template as appointmentCancelled } from './appointment-cancelled.tsx'
import { template as applicantAccess } from './applicant-access.tsx'
import { template as rescheduleConfirmation } from './reschedule-confirmation.tsx'
import { template as setterRescheduleNotification } from './setter-reschedule-notification.tsx'
import { template as referralConfirmed } from './referral-confirmed.tsx'
import { template as communityAccessReady } from './community-access-ready.tsx'
import { template as e2eCriticalAlert } from './e2e-critical-alert.tsx'

// Layer 43 — Loro Piana style documentation templates (calm, no pressure, single CTA)
import { template as lpApplicantAccess } from './lp-applicant-access.tsx'
import { template as lpAppointmentConfirmed } from './lp-appointment-confirmed.tsx'
import { template as lpAppointmentRescheduled } from './lp-appointment-rescheduled.tsx'
import { template as lpAppointmentCancelled } from './lp-appointment-cancelled.tsx'
import { template as lpAppointmentReminder } from './lp-appointment-reminder.tsx'
import { template as lpNoShow } from './lp-no-show.tsx'
import { template as lpWelcome } from './lp-welcome.tsx'
import { template as lpCloseSuccess } from './lp-close-success.tsx'
import { template as lpLevelUp } from './lp-level-up.tsx'
import { template as lpProgressUpdate } from './lp-progress-update.tsx'
import { template as lpMagicLinkAccess } from './lp-magic-link-access.tsx'
import { template as lpOnboardingStarted } from './lp-onboarding-started.tsx'
import { template as lpOnboardingCompleted } from './lp-onboarding-completed.tsx'
import { template as lpSuccessfulInterview } from './lp-successful-interview.tsx'
import { template as lpBirthdayMessage } from './lp-birthday-message.tsx'
import { template as lpPlaybookGuide } from './lp-playbook-guide.tsx'
import { template as lpEthicalClosingPlaybook } from './lp-ethical-closing-playbook.tsx'
import { template as applyNurtureD1 } from './apply-nurture-d1.tsx'
import { template as applyNurtureD3 } from './apply-nurture-d3.tsx'
import { template as applyNurtureD14 } from './apply-nurture-d14.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'e2e-critical-alert': e2eCriticalAlert,
  // Loro Piana family
  'lp-applicant-access': lpApplicantAccess,
  'lp-appointment-confirmed': lpAppointmentConfirmed,
  'lp-appointment-rescheduled': lpAppointmentRescheduled,
  'lp-appointment-cancelled': lpAppointmentCancelled,
  'lp-appointment-reminder': lpAppointmentReminder,
  'lp-no-show': lpNoShow,
  'lp-welcome': lpWelcome,
  'lp-close-success': lpCloseSuccess,
  'lp-level-up': lpLevelUp,
  'lp-progress-update': lpProgressUpdate,
  'lp-magic-link-access': lpMagicLinkAccess,
  'lp-onboarding-started': lpOnboardingStarted,
  'lp-onboarding-completed': lpOnboardingCompleted,
  'lp-successful-interview': lpSuccessfulInterview,
  'lp-birthday-message': lpBirthdayMessage,
  'lp-playbook-guide': lpPlaybookGuide,
  'lp-ethical-closing-playbook': lpEthicalClosingPlaybook,
  'apply-nurture-d1': applyNurtureD1,
  'apply-nurture-d3': applyNurtureD3,
  'apply-nurture-d14': applyNurtureD14,
  'lead-assigned': leadAssigned,
  'booking-confirmation': bookingConfirmation,
  'status-change': statusChange,
  'appointment-reminder': appointmentReminder,
  'setter-assigned': setterAssigned,
  'setter-reminder': setterReminder,
  'sla-escalation': slaEscalation,
  'lead-reminder': leadReminder,
  'lead-reminder-24h': leadReminder24h,
  'lead-reminder-10min': leadReminder10min,
  'no-show-recovery': noShowRecovery,
  'appointment-cancelled': appointmentCancelled,
  'applicant-access': applicantAccess,
  'reschedule-confirmation': rescheduleConfirmation,
  'setter-reschedule-notification': setterRescheduleNotification,
  'referral-confirmed': referralConfirmed,
  'community-access-ready': communityAccessReady,
}
