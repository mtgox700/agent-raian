import { MetadataRoute } from 'next'
import { brand } from '@/lib/brand'

const SITE = brand.url

// Private areas no crawler should index.
const PRIVATE = ['/dashboard/', '/api/', '/admin/', '/onboarding', '/monitoring']

// Answer-engine / AI crawlers we WANT to read public pages so Phantera can be
// cited by ChatGPT, Perplexity, Claude, Google AI Overviews, etc. (AEO).
// Previously GPTBot + CCBot were fully disallowed: that silently blocked the
// two biggest answer-engine sources from ever seeing the site.
const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',   // OpenAI / ChatGPT
  'PerplexityBot', 'Perplexity-User',          // Perplexity
  'ClaudeBot', 'Claude-Web', 'anthropic-ai',   // Anthropic / Claude
  'Google-Extended',                           // Google AI (Gemini / AI Overviews)
  'CCBot',                                     // Common Crawl (feeds many LLMs)
  'Applebot-Extended',                         // Apple Intelligence
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*',     allow: '/', disallow: PRIVATE },
      // Explicitly welcome the AI answer engines on public content.
      { userAgent: AI_BOTS, allow: '/', disallow: PRIVATE },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  }
}
