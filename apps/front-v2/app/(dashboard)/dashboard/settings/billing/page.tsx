import { redirect } from 'next/navigation'

/**
 * /dashboard/settings/billing -> /dashboard/settings?tab=billing, as in body n°1:
 * billing lives in the settings' Facturation tab (data: views.settings).
 * Keeps legacy links and Stripe return URLs from ending on a 404.
 */
export default function BillingRedirectPage() {
  redirect('/dashboard/settings?tab=billing')
}
