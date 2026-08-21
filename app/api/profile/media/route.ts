import { auth0 } from '@/lib/auth0'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)
import { CHAT_UPLOAD_BUCKET, getSupabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function mediaKind(type: string) {
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return 'unknown'
}

async function extractAudio(file: File) {
  const directory = await mkdtemp(join(tmpdir(), 'uncgpt-audio-'))
  const input = join(directory, safeSegment(file.name || 'upload.bin'))
  const output = join(directory, 'profile-music.mp3')
  try {
    await writeFile(input, Buffer.from(await file.arrayBuffer()))
    await execFileAsync('ffmpeg', ['-y', '-i', input, '-vn', '-map', '0:a:0', '-codec:a', 'libmp3lame', '-b:a', '192k', output], { timeout: 45_000, maxBuffer: 2 * 1024 * 1024 })
    const buffer = await readFile(output)
    return { buffer, contentType: 'audio/mpeg', extension: 'mp3', extracted: true }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

export async function POST(request: NextRequest) {
  const session = await auth0.getSession().catch(() => null)
  const userId = session?.user?.sub
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  if (!supabase) return Response.json({ error: 'Profile storage is not configured' }, { status: 503 })

  const formData = await request.formData()
  const file = formData.get('file')
  const purpose = formData.get('purpose') === 'music'
  const kind = file instanceof File ? mediaKind(file.type) : null
  if (!(file instanceof File) || !kind) {
    return Response.json({ error: 'Choose a file to upload.' }, { status: 400 })
  }
  const maxSize = kind === 'video' ? 50 : 25
  if (file.size > maxSize * 1024 * 1024) {
    return Response.json({ error: `Files must be ${maxSize} MB or smaller` }, { status: 413 })
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

  let uploadKind = purpose ? 'audio' : kind
  let extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
  let contentType = file.type || 'application/octet-stream'
  let buffer = Buffer.from(await file.arrayBuffer())
  let extracted = false
  if (purpose || kind === 'audio' || kind === 'video' || kind === 'unknown') {
    try {
      const result = await extractAudio(file)
      buffer = result.buffer
      contentType = result.contentType
      extension = result.extension
      uploadKind = 'audio'
      extracted = result.extracted
    } catch {
      // Any file is still accepted for Music. If extraction is unavailable or
      // the file has no audio stream, retain the original so the user can
      // replace it later instead of rejecting the upload at the picker stage.
    }
  }
  const path = `users/${safeSegment(userId)}/profile/${uploadKind}/${Date.now()}-${crypto.randomUUID()}.${extension}`
  const storage = supabase.storage.from(CHAT_UPLOAD_BUCKET)
  const { error: uploadError } = await storage.upload(path, buffer, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  })
  if (uploadError) return Response.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })

  const { data } = storage.getPublicUrl(path)
  if (!data.publicUrl) {
    await storage.remove([path])
    return Response.json({ error: 'Storage did not return a public URL' }, { status: 502 })
  }

  return Response.json({ url: data.publicUrl, kind: uploadKind, path, extracted })
}
