/**
 * FAQ shown on the landing page. Single source for the visible FAQ and for
 * the FAQPage structured data read by search engines and AI assistants, so
 * the two can never say different things.
 */
// Texts: packages/content/content/<brand>/<locale>/faq.json.
// Reality Lock (C1): réponses factuelles : sources réelles, pas de taux de
// réponse inventés, pas de promesses CRM non livrées.
import { faqContent } from './content'

export const faqs = faqContent.questions
