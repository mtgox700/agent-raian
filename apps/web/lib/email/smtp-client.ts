/**
 * Phantera: SMTP Client (nodemailer wrapper)
 *
 * Used for custom SMTP connections (Gmail App Password, Outlook SMTP,
 * any third-party SMTP provider).
 *
 * Connections are NOT pooled: each send creates a new transporter.
 * This is correct for serverless environments (Vercel) where connection
 * pooling would leak across invocations.
 */

import nodemailer from 'nodemailer'
import { resolvePublicHost } from '@/lib/security/private-network'
import type { ProviderSendResult } from './sender-router'

interface SmtpSendParams {
  host:                string
  port:                number
  secure:              boolean
  user:                string
  /** From address: an alias of the account's own domain, else the login. */
  fromEmail?:          string
  password:            string
  to:                  string
  subject:             string
  html:                string
  listUnsubscribeUrl?: string
  /** Display name shown in the From header, e.g. "Zakaria KHCHICHE". */
  fromName?:          string | null
  /** Reply-To address(es): used to route lead replies to the inbound worker. */
  replyTo?:           string | string[]
}

/**
 * The host comes from user input: resolve it, refuse a private or internal
 * address (SSRF), and connect to exactly the address checked. The
 * certificate is still verified against the host name (servername).
 */
async function publicEndpoint(host: string): Promise<{ host: string; tls: { servername: string } }> {
  return { host: await resolvePublicHost(host), tls: { servername: host } }
}

export async function sendViaSmtp(params: SmtpSendParams): Promise<ProviderSendResult> {
  const transporter = nodemailer.createTransport({
    ...(await publicEndpoint(params.host)),
    port:   params.port,
    secure: params.secure,
    auth:   { user: params.user, pass: params.password },
    connectionTimeout: 10_000,
    greetingTimeout:   5_000,
  })

  const headers: Record<string, string> = {}
  if (params.listUnsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${params.listUnsubscribeUrl}>, <mailto:unsubscribe@phantera-tn.com?subject=unsubscribe>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }

  const info = await transporter.sendMail({
    from:    params.fromName
      ? { name: params.fromName, address: params.fromEmail ?? params.user }
      : params.fromEmail ?? params.user,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    to:      params.to,
    subject: params.subject,
    html:    params.html,
    headers,
  })

  transporter.close()

  return {
    messageId:         info.messageId,
    providerMessageId: info.messageId,
    providerThreadId:  null,
    provider:          'smtp',
  }
}

/**
 * Test SMTP connectivity: called from the settings UI before saving credentials.
 * Returns true on success, throws a user-friendly error on failure.
 */
export async function testSmtpConnection(params: {
  host:     string
  port:     number
  secure:   boolean
  user:     string
  password: string
}): Promise<true> {
  let endpoint: Awaited<ReturnType<typeof publicEndpoint>>
  try {
    endpoint = await publicEndpoint(params.host)
  } catch {
    throw new Error('Serveur SMTP introuvable ou non autorisé : indiquez l’adresse publique de votre fournisseur.')
  }
  const transporter = nodemailer.createTransport({
    ...endpoint,
    port:              params.port,
    secure:            params.secure,
    auth:              { user: params.user, pass: params.password },
    connectionTimeout: 10_000,
    greetingTimeout:   5_000,
  })

  try {
    await transporter.verify()
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Surface a clean error: never expose raw SMTP protocol errors to the UI
    if (msg.includes('ECONNREFUSED'))  throw new Error(`Connexion refusée sur ${params.host}:${params.port}`)
    if (msg.includes('ETIMEDOUT'))     throw new Error(`Timeout de connexion vers ${params.host}`)
    if (msg.includes('ENOTFOUND'))     throw new Error(`Hôte SMTP introuvable : ${params.host}`)
    if (msg.includes('534') || msg.includes('535')) throw new Error('Identifiants incorrects')
    throw new Error(`Erreur SMTP : ${msg}`)
  } finally {
    transporter.close()
  }
}
