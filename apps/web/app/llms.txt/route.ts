import { brand } from '@/lib/brand'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import { faqs } from '@/lib/marketing/faq-content'
import { comparisons } from '@/lib/marketing/comparisons'
import { sortedArticles } from '@/lib/marketing/blog'

export const dynamic = 'force-static'

/**
 * /llms.txt: a plain summary for AI assistants and LLM crawlers
 * (https://llmstxt.org). Built from the same sources as the site (plans, FAQ)
 * so it can never claim something the product does not do.
 */
function body(): string {
  const plans = (['FREE', 'PRO', 'BUSINESS'] as const).map((key) => {
    const plan = PLAN_CONFIG[key]
    const price = plan.price === 0 ? 'gratuit' : `${plan.price} € HT / mois`
    return `- ${plan.name} (${price}) : ${plan.features.join(', ')}`
  })
  const enterprise = PLAN_CONFIG.ENTERPRISE

  return [
    `# ${brand.name}`,
    '',
    `> ${brand.description}`,
    '',
    `${brand.name} est un logiciel de prospection B2B par IA pour les petites équipes commerciales francophones : recherche de décideurs, vérification des e-mails, scoring des leads, rédaction de séquences e-mail et LinkedIn, détection et classement des réponses. Les messages partent depuis les propres comptes du client (Gmail, Outlook, SMTP, LinkedIn), et chaque séquence s'arrête dès que le prospect répond.`,
    '',
    '## Formules',
    ...plans,
    `- ${enterprise.name} (${enterprise.price} € HT / mois, sur devis avec l'équipe) : ${enterprise.features.join(', ')}`,
    '',
    '## Questions fréquentes',
    ...faqs.flatMap((faq) => [`### ${faq.question}`, faq.answer, '']),
    '## Liens',
    `- Site : ${brand.url}`,
    `- À propos : ${brand.url}/about`,
    ...comparisons.map((c) => `- Comparatif ${brand.name} et ${c.name} : ${brand.url}/alternative/${c.slug}`),
    `- Pilote de 30 jours accompagné : ${brand.url}/pilote`,
    `- Blog : ${brand.url}/blog`,
    ...sortedArticles().map((a) => `- Article « ${a.title} » : ${brand.url}/blog/${a.slug} (${a.description})`),
    `- Créer un compte : ${brand.url}/sign-up`,
    `- Confidentialité : ${brand.url}/legal/privacy`,
    `- Conditions : ${brand.url}/legal/terms`,
    '',
  ].join('\n')
}

export function GET() {
  return new Response(body(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
