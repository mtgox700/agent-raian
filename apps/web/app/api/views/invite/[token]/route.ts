/**
 * GET /api/views/invite/[token]: data of the invitation page (lib/views/invite).
 * Public: the token is the key; an unusable one answers { state: 'invalid' }
 * and nothing about it. Signed out, the visitor only learns what the page
 * already showed them: the invitation, and that they must sign in or up.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { inviteView } from '@/lib/views/invite'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const error = req.nextUrl.searchParams.get('error') ?? undefined
  const { userId } = await auth()

  return NextResponse.json(await inviteView(db, { token, userId: userId ?? null, error }))
}
