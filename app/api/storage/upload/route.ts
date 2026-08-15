import { NextRequest } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { CHAT_UPLOAD_BUCKET, getSupabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

export async function POST(request: NextRequest) {
  const session = await auth0.getSession()
  if (!session?.user?.sub) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  if (!supabase) return Response.json({ error: 'Supabase storage is not configured' }, { status: 503 })

  const formData = await request.formData()
  const file = formData.get('file')
  const chatId = String(formData.get('chatId') || '')
  if (!(file instanceof File)) return Response.json({ error: 'Missing file' }, { status: 400 })
  if (!file.type.startsWith('image/')) return Response.json({ error: 'Only images are supported' }, { status: 415 })
  if (file.size > 15 * 1024 * 1024) return Response.json({ error: 'Image must be 15 MB or smaller' }, { status: 413 })

  const userId = safeSegment(session.user.sub)
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `users/${userId}/images/${Date.now()}-${crypto.randomUUID()}.${extension}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage.from(CHAT_UPLOAD_BUCKET).upload(path, buffer, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 })

  const { data: publicUrlData } = supabase.storage.from(CHAT_UPLOAD_BUCKET).getPublicUrl(path)
  const publicUrl = publicUrlData.publicUrl

  const { data: metadata, error: metadataError } = await supabase
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

  if (metadataError) {
    await supabase.storage.from(CHAT_UPLOAD_BUCKET).remove([path])
    return Response.json({ error: metadataError.message }, { status: 500 })
  }

  return Response.json({
    id: metadata.id,
    url: publicUrl,
    path,
    storedRemotely: true,
  })
}
