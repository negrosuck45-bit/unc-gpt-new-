import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { CHAT_UPLOAD_BUCKET, getSupabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const ENCRYPTED_UPLOAD_MAGIC = Buffer.from('UGPT1')
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
])

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function uploadEncryptionKey() {
  const secret = process.env.APP_DATA_ENCRYPTION_KEY || process.env.CLERK_SECRET_KEY
  if (!secret || secret.length < 32) return null
  return createHash('sha256').update(`uncgpt-private-upload-v1:${secret}`).digest()
}

function encryptUpload(buffer: Buffer) {
  const key = uploadEncryptionKey()
  if (!key) throw new Error('Private upload encryption is unavailable.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([ENCRYPTED_UPLOAD_MAGIC, iv, authTag, ciphertext])
}

export async function POST(request: NextRequest) {
  const session = await getSession().catch(() => null)
  if (!session?.user?.sub) return Response.json({ error: 'Sign in before uploading files.' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  if (!supabase) return Response.json({ error: 'Private storage is not configured.' }, { status: 503 })

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const chatId = String(formData.get('chatId') || '').trim()
    if (!(file instanceof File)) return Response.json({ error: 'Missing file.' }, { status: 400 })
    if (!ALLOWED_MIME_TYPES.has(file.type)) return Response.json({ error: 'This file type is not supported.' }, { status: 415 })
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return Response.json({ error: 'Uploads must be 15 MB or smaller.' }, { status: 413 })
    if (chatId.length > 160) return Response.json({ error: 'Invalid chat reference.' }, { status: 400 })

    const storage = supabase.storage.from(CHAT_UPLOAD_BUCKET)
    const { data: bucket } = await supabase.storage.getBucket(CHAT_UPLOAD_BUCKET)
    if (!bucket) {
      const { error: bucketError } = await supabase.storage.createBucket(CHAT_UPLOAD_BUCKET, { public: false, fileSizeLimit: '15MB' })
      if (bucketError && !bucketError.message.toLowerCase().includes('already exists')) {
        return Response.json({ error: 'Private storage could not be initialized.' }, { status: 500 })
      }
    }

    const userId = safeSegment(session.user.sub)
    const path = `users/${userId}/${Date.now()}-${crypto.randomUUID()}.enc`
    const encryptedBuffer = encryptUpload(Buffer.from(await file.arrayBuffer()))
    const { error: uploadError } = await storage.upload(path, encryptedBuffer, {
      contentType: 'application/octet-stream',
      cacheControl: '0',
      upsert: false,
    })
    if (uploadError) return Response.json({ error: 'Private upload failed.' }, { status: 500 })

    const relativeUrl = `/api/storage/file?path=${encodeURIComponent(path)}`
    const { data: metadata, error: metadataError } = await supabase
      .from('chat_attachments')
      .insert({
        user_id: session.user.sub,
        chat_id: chatId || null,
        file_name: safeSegment(file.name || 'upload'),
        file_path: path,
        public_url: relativeUrl,
        mime_type: file.type,
        file_size: file.size,
      })
      .select('id')
      .single()

    if (metadataError || !metadata?.id) {
      await storage.remove([path])
      return Response.json({ error: 'Private upload metadata could not be saved.' }, { status: 500 })
    }

    return Response.json({
      id: metadata.id,
      url: relativeUrl,
      path,
      storedRemotely: true,
      metadataPersisted: true,
    })
  } catch (error) {
    console.error('[storage/upload] private upload failed', error instanceof Error ? error.message : 'unknown error')
    return Response.json({ error: 'Private upload failed.' }, { status: 500 })
  }
}
