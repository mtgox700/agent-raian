/**
 * Screenshot a statically built page without running a server (also where
 * the browser cannot reach localhost): reads .next/server/app/<page>.html,
 * inlines CSS, fonts and images, drops scripts (what a visitor sees before
 * hydration), renders it in Chromium with every request blocked.
 *
 *   NEXT_PUBLIC_BRAND=sparx npm run build --workspace=@phantera/front-v2
 *   node scripts/render-static.cjs apps/front-v2 index.html sparx.png [width]
 */
const fs = require('fs'), path = require('path')
const { chromium } = require('playwright')
const [appDirArg, htmlRel, out, width = '1280'] = process.argv.slice(2)
const appDir = path.resolve(appDirArg)
const next = path.join(appDir, '.next')
const mime = { '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif' }
const dataUri = (file) => `data:${mime[path.extname(file).toLowerCase()] || 'application/octet-stream'};base64,${fs.readFileSync(file).toString('base64')}`
const resolveAsset = (url) => {
  url = url.split('?')[0]
  if (url.startsWith('/_next/static/')) return path.join(next, 'static', url.slice('/_next/static/'.length))
  const pub = path.join(appDir, 'public', url)
  return fs.existsSync(pub) ? pub : null
}
let html = fs.readFileSync(path.join(next, 'server', 'app', htmlRel), 'utf8')
// Inline stylesheets (fonts inside them as data URIs).
html = html.replace(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  const f = resolveAsset(href); if (!f) return ''
  const css = fs.readFileSync(f, 'utf8').replace(/url\((\/_next\/static\/[^)]+)\)/g, (m, u) => { const a = resolveAsset(u); return a ? `url(${dataUri(a)})` : m })
  return `<style>${css}</style>`
})
// Next image optimizer URLs and plain public images.
html = html.replace(/(src|srcSet|srcset)="([^"]+)"/g, (m, attr, val) => {
  if (attr !== 'src') return ''
  let u = val
  const opt = /\/_next\/image\?url=([^&]+)/.exec(val); if (opt) u = decodeURIComponent(opt[1])
  const f = u.startsWith('/') ? resolveAsset(u) : null
  return f ? `src="${dataUri(f)}"` : m
})
html = html.replace(/loading="lazy"/g, '')
html = html.replace(/<script[\s\S]*?<\/script>/g, '') // static render, no JS (what a visitor sees first)
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: Number(width), height: 900 }, reducedMotion: 'reduce' })
  await p.route('**/*', (r) => r.abort())
  await p.setContent(html, { waitUntil: 'load' })
  await p.waitForTimeout(500)
  await p.screenshot({ path: out, fullPage: true })
  console.log(out, await p.evaluate(() => document.body.scrollHeight))
  await b.close()
})()
