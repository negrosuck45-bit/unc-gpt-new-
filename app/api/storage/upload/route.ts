import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { CHAT_UPLOAD_BUCKET, getSupabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

export async function POST(request: NextRequest) {
  const session = await getSession().catch(() => null)

  const supabase = getSupabaseAdmin()
  if (!supabase) return Response.json({ error: 'Supabase storage is not configured' }, { status: 503 })

  const storage = supabase.storage.from(CHAT_UPLOAD_BUCKET)
  const { data: bucket } = await supabase.storage.getBucket(CHAT_UPLOAD_BUCKET)
  if (!bucket) {
    const { error: bucketError } = await supabase.storage.createBucket(CHAT_UPLOAD_BUCKET, { public: true, fileSizeLimit: '15MB' })
    if (bucketError && !bucketError.message.toLowerCase().includes('already exists')) {
      return Response.json({ error: `Storage bucket setup failed: ${bucketError.message}` }, { status: 500 })
    }
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const chatId = String(formData.get('chatId') || '')
  if (!(file instanceof File)) return Response.json({ error: 'Missing file' }, { status: 400 })
  if (!file.type.startsWith('image/')) return Response.json({ error: 'Only images are supported' }, { status: 415 })
  if (file.size > 15 * 1024 * 1024) return Response.json({ error: 'Image must be 15 MB or smaller' }, { status: 413 })

  const userId = safeSegment(session?.user?.sub || 'anonymous')
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `users/${userId}/images/${Date.now()}-${crypto.randomUUID()}.${extension}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await storage.upload(path, buffer, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (uploadError) return Response.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })

  const { data: publicUrlData } = supabase.storage.from(CHAT_UPLOAD_BUCKET).getPublicUrl(path)
  const publicUrl = publicUrlData.publicUrl
  if (!publicUrl || !publicUrl.includes(`/storage/v1/object/public/${CHAT_UPLOAD_BUCKET}/`)) {
    await storage.remove([path])
    return Response.json({ error: 'Supabase uploaded the image but did not return a valid public Storage URL' }, { status: 502 })
  }

    let metadata: { id: string } | null = null
  let metadataError: { message: string } | null = null
  if (session?.user?.sub) {
    const result = await supabase
      .from('chat_attachments')
      .insert({
        user_id: session.user.sub,
        chat_id: chatId || null,
        file_name: file.name,
        file_path: path,
        public_url: publicUrl,
        mime_type: file.type,
        file_size: file.size,
      })
      .select('id')
      .single()
    metadata = result.data
    metadataError = result.error
  }

  // Storage is the source of truth for chat media. If the optional metadata
  // table is unavailable—or this is a Safari session without Clerk cookies—
  // keep the uploaded object and return its public URL.
  if (metadataError) console.warn('[storage/upload] metadata insert skipped:', metadataError.message)

  return Response.json({
    id: metadata?.id ?? null,
    url: publicUrl,
    path,
    storedRemotely: true,
    metadataPersisted: Boolean(metadata?.id),
  })
}
