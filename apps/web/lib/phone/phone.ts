/**
 * Phone numbers for WhatsApp and SMS links.
 *
 * Stored and used in international form, digits only ("33612345678"): a
 * national "06…" would reach the wrong person once dialled from abroad, and
 * wa.me only accepts the international form.
 */

/** Digits only with country code, or null when the input is not an international number. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim()
  if (!/^(\+|00)/.test(trimmed)) return null
  if (/[^\d\s+().-]/.test(trimmed)) return null
  const digits = trimmed.replace(/^00/, '').replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0') ? digits : null
}

/** "+33 6 12 34 56 78" style display for a stored number. */
export function formatPhone(digits: string): string {
  if (digits.startsWith('33') && digits.length === 11) {
    return `+33 ${digits.slice(2, 3)} ${digits.slice(3).match(/.{1,2}/g)?.join(' ')}`
  }
  return `+${digits}`
}

/** Opens WhatsApp on a chat with the number, message prefilled; the user sends it. */
export function whatsappLink(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

/**
 * Opens the phone's SMS app with the message prefilled. "?&body=" is the form
 * both iOS and Android accept.
 */
export function smsLink(digits: string, text: string): string {
  return `sms:+${digits}?&body=${encodeURIComponent(text)}`
}
