import { auth0 } from '@/lib/auth0'
import { CHAT_UPLOAD_BUCKET, getSupabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function mediaKind(type: string) {
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return null
}

export async function POST(request: NextRequest) {
  const session = await auth0.getSession().catch(() => null)
  const userId = session?.user?.sub
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  if (!supabase) return Response.json({ error: 'Profile storage is not configured' }, { status: 503 })

  const formData = await request.formData()
  const file = formData.get('file')
  const kind = file instanceof File ? mediaKind(file.type) : null
  if (!(file instanceof File) || !kind) {
    return Response.json({ error: 'Upload an image, video, or audio file' }, { status: 400 })
  }
  const maxSize = kind === 'video' ? 50 : 25
  if (file.size > maxSize * 1024 * 1024) {
    return Response.json({ error: `${kind} must be ${maxSize} MB or smaller` }, { status: 413 })
  }

  const { data: bucket } = await supabase.storage.getBucket(CHAT_UPLOAD_BUCKET)
  if (!bucket) {
    const { error } = await supabase.storage.createBucket(CHAT_UPLOAD_BUCKET, {
      public: true,
      fileSizeLimit: '50MB',
    })
    if (error && !error.message.toLowerCase().includes('already exists')) {
      return Response.json({ error: `Storage bucket setup failed: ${error.message}` }, { status: 500 })
    }
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const path = `users/${safeSegment(userId)}/profile/${kind}/${Date.now()}-${crypto.randomUUID()}.${extension}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const storage = supabase.storage.from(CHAT_UPLOAD_BUCKET)
  const { error: uploadError } = await storage.upload(path, buffer, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (uploadError) return Response.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })

  const { data } = storage.getPublicUrl(path)
  if (!data.publicUrl) {
    await storage.remove([path])
    return Response.json({ error: 'Storage did not return a public URL' }, { status: 502 })
  }

  return Response.json({ url: data.publicUrl, kind, path })
}
