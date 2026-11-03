// Generates the raster icons from app/icon.svg (the « Arrêt net » mark):
// app/favicon.ico (16, 32, 48), app/icon1.png (96), public/icon-192.png,
// public/icon-512.png and public/icon-maskable-512.png.
// Run: node scripts/generate-icons.mjs
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const BACKGROUND = '#050508'
const svg = await readFile(new URL('../app/icon.svg', import.meta.url))

const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()

/** Maskable icon: the mark kept inside the 80 % safe zone on a full-bleed background. */
async function maskable(size) {
  const inner = Math.round(size * 0.7)
  const mark = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer()
}

/** ICO container holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

const icoSizes = [16, 32, 48]
const icoImages = await Promise.all(icoSizes.map(async (size) => ({ size, data: await png(size) })))

await writeFile(new URL('../app/favicon.ico', import.meta.url), ico(icoImages))
await writeFile(new URL('../app/icon1.png', import.meta.url), await png(96))
await writeFile(new URL('../public/icon-192.png', import.meta.url), await png(192))
await writeFile(new URL('../public/icon-512.png', import.meta.url), await png(512))
await writeFile(new URL('../public/icon-maskable-512.png', import.meta.url), await maskable(512))
console.log('icons written')
