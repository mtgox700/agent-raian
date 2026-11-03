/**
 * Sequence step channels. WHATSAPP and SMS are "phone" steps: Phantera drafts
 * the message, the user sends it from their own phone ("À envoyer" queue).
 */

/** As stored (Prisma StepChannel). */
export type StepChannelDb = 'EMAIL' | 'LINKEDIN' | 'WHATSAPP' | 'SMS'

/** As used by the campaign wizard. */
export type WizardChannel = 'email' | 'linkedin' | 'whatsapp' | 'sms'

export const WIZARD_CHANNELS: readonly WizardChannel[] = ['email', 'linkedin', 'whatsapp', 'sms']

export const CHANNEL_LABELS: Record<WizardChannel, string> = {
  email:    'Email',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  sms:      'SMS',
}

export function toDbChannel(channel: WizardChannel | undefined): StepChannelDb {
  return (channel ?? 'email').toUpperCase() as StepChannelDb
}

export function toWizardChannel(channel: string | undefined): WizardChannel {
  const c = (channel ?? 'email').toLowerCase()
  return (WIZARD_CHANNELS as readonly string[]).includes(c) ? (c as WizardChannel) : 'email'
}

export function isPhoneChannel(channel: string | undefined): boolean {
  const c = (channel ?? '').toLowerCase()
  return c === 'whatsapp' || c === 'sms'
}

/** Next channel when the user clicks the channel badge of a step. */
export function nextWizardChannel(channel: WizardChannel | undefined): WizardChannel {
  const i = WIZARD_CHANNELS.indexOf(channel ?? 'email')
  return WIZARD_CHANNELS[(i + 1) % WIZARD_CHANNELS.length]
}
