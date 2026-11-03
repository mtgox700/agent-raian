import { defineConfig } from 'prisma/config'
import * as dotenv from 'dotenv'
import path from 'path'

// Load .env.local so Prisma CLI picks up DATABASE_URL during migrations
dotenv.config({ path: path.resolve(__dirname, '.env.local') })

export default defineConfig({
  engine: 'classic' as const,
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
})
