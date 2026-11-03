/** WhatsApp / SMS limits, shared by the server and the lead panel (client-safe). */

export type TouchChannel = 'WHATSAPP' | 'SMS'

export const TOUCH_MAX_LENGTH: Record<TouchChannel, number> = {
  // Two SMS segments: longer messages are split and often read as spam.
  SMS:      300,
  WHATSAPP: 600,
}

export const SMS_OPT_OUT = 'Répondez STOP pour ne plus être contacté.'
