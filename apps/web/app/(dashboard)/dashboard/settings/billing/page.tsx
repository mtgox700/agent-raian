import { redirect } from 'next/navigation'

/**
 * /dashboard/settings/billing -> redirects to /dashboard/settings?tab=billing
 * This prevents 404s from any legacy links.
 */
export default function BillingRedirectPage() {
  redirect('/dashboard/settings?tab=billing')
}
