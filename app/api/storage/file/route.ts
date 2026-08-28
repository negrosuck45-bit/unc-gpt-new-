import { createDecipheriv, createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { CHAT_UPLOAD_BUCKET, getSupabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const ENCRYPTED_UPLOAD_MAGIC = Buffer.from('UGPT1')
const HEADER_BYTES = ENCRYPTED_UPLOAD_MAGIC.length + 12 + 16

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function uploadEncryptionKey() {
  const secret = process.env.APP_DATA_ENCRYPTION_KEY || process.env.CLERK_SECRET_KEY
  if (!secret || secret.length < 32) return null
  return createHash('sha256').update(`uncgpt-private-upload-v1:${secret}`).digest()
}

function decryptUpload(buffer: Buffer) {
  const key = uploadEncryptionKey()
  if (!key || buffer.length <= HEADER_BYTES || !buffer.subarray(0, ENCRYPTED_UPLOAD_MAGIC.length).equals(ENCRYPTED_UPLOAD_MAGIC)) {
    throw new Error('Invalid private upload.')
  }
  const ivStart = ENCRYPTED_UPLOAD_MAGIC.length
  const authTagStart = ivStart + 12
  const decipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(ivStart, authTagStart))
  decipher.setAuthTag(buffer.subarray(authTagStart, HEADER_BYTES))
  return Buffer.concat([decipher.update(buffer.subarray(HEADER_BYTES)), decipher.final()])
}

export async function GET(request: NextRequest) {
  const session = await getSession().catch(() => null)
  if (!session?.user?.sub) return Response.json({ error: 'Sign in is required.' }, { status: 401 })

  const path = String(request.nextUrl.searchParams.get('path') || '')
  const userPrefix = `users/${safeSegment(session.user.sub)}/`
  if (!path.startsWith(userPrefix) || !path.endsWith('.enc')) return Response.json({ error: 'File not found.' }, { status: 404 })

  const supabase = getSupabaseAdmin()
  if (!supabase) return Response.json({ error: 'Private storage is not configured.' }, { status: 503 })

  try {
    // Require a matching application record before accessing the storage object.
    // The path prefix is an additional guard; the database record is authoritative.
    const { data: metadata, error: metadataError } = await supabase
      .from('chat_attachments')
      .select('file_name, mime_type')
      .eq('user_id', session.user.sub)
      .eq('file_path', path)
      .maybeSingle()
    if (metadataError || !metadata) return Response.json({ error: 'File not found.' }, { status: 404 })

    const { data, error } = await supabase.storage.from(CHAT_UPLOAD_BUCKET).download(path)
    if (error || !data) return Response.json({ error: 'File not found.' }, { status: 404 })

    const decrypted = decryptUpload(Buffer.from(await data.arrayBuffer()))
    const mimeType = typeof metadata.mime_type === 'string' ? metadata.mime_type : 'application/octet-stream'
    const filename = String(metadata?.file_name || 'upload').replace(/["\\\r\n]/g, '_').slice(0, 120)

    return new Response(decrypted, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(decrypted.length),
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[storage/file] private file retrieval failed', error instanceof Error ? error.message : 'unknown error')
    return Response.json({ error: 'File could not be opened.' }, { status: 422 })
  }
}
