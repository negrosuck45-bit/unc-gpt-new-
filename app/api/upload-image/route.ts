import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * Deliberately disabled: the previous implementation sent user images to
 * anonymous public file hosts. Secure image attachments now use the
 * authenticated private-storage endpoint instead.
 */
export async function POST(_: NextRequest) {
  const session = await getSession().catch(() => null)
  if (!session?.user?.sub) return Response.json({ error: 'Sign in is required.' }, { status: 401 })
  return Response.json({
    error: 'Secure image editing uploads are unavailable until a private image-processing provider is configured.',
  }, { status: 503 })
}
