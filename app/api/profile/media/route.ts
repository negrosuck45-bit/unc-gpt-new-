import { NextRequest } from 'next/server'
import ffmpegPath from 'ffmpeg-static'
import { getSession } from '@/lib/auth'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)
import { PROFILE_MEDIA_BUCKET, getSupabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function mediaKind(type: string, name = '') {
  const normalizedType = type.toLowerCase()
  const extension = name.split('.').pop()?.toLowerCase() || ''
  if (normalizedType.startsWith('image/') || ['gif', 'png', 'jpg', 'jpeg', 'webp', 'svg'].includes(extension)) return 'image'
  if (normalizedType.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v'].includes(extension)) return 'video'
  if (normalizedType.startsWith('audio/') || ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'flac'].includes(extension)) return 'audio'
  return 'unknown'
}

async function extractAudio(file: File) {
  const directory = await mkdtemp(join(tmpdir(), 'uncgpt-audio-'))
  const input = join(directory, safeSegment(file.name || 'upload.bin'))
  const output = join(directory, 'profile-music.mp3')
  const binary = ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg'
  try {
    await writeFile(input, Buffer.from(await file.arrayBuffer()))
    let probeStderr = ''
    try {
      await execFileAsync(binary, ['-hide_banner', '-i', input], { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 })
    } catch (error: any) {
      probeStderr = String(error?.stderr || '')
    }
    const hasAudioStream = /Stream #[^\n]*Audio:/i.test(probeStderr)
    if (!hasAudioStream) {
      const mediaError = new Error('This file contains no audio track. Choose the original video with sound, or upload an audio file.')
      ;(mediaError as Error & { code?: string }).code = 'NO_AUDIO_STREAM'
      throw mediaError
    }
    await execFileAsync(binary, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-map', '0:a:0', '-codec:a', 'libmp3lame', '-b:a', '192k', output], { timeout: 45_000, maxBuffer: 2 * 1024 * 1024 })
    const buffer = await readFile(output)
    return { buffer, contentType: 'audio/mpeg', extension: 'mp3', extracted: true }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession().catch(() => null)
  const userId = session?.user?.sub
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  if (!supabase) return Response.json({ error: 'Profile storage is not configured' }, { status: 503 })

  const formData = await request.formData()
  const file = formData.get('file')
  const purpose = formData.get('purpose') === 'music'
  const kind = file instanceof File ? mediaKind(file.type, file.name) : null
  if (!(file instanceof File) || !kind) {
    return Response.json({ error: 'Choose a file to upload.' }, { status: 400 })
  }
  if (purpose && kind === 'image') {
    return Response.json({ error: 'Images cannot be used as Music. Choose an audio or video file.' }, { status: 415 })
  }
  const maxSize = kind === 'video' ? 50 : 25
  if (file.size > maxSize * 1024 * 1024) {
    return Response.json({ error: `Files must be ${maxSize} MB or smaller` }, { status: 413 })
  }

  const { data: bucket } = await supabase.storage.getBucket(PROFILE_MEDIA_BUCKET)
  if (!bucket) {
    const { error } = await supabase.storage.createBucket(PROFILE_MEDIA_BUCKET, {
      public: true,
      fileSizeLimit: '50MB',
    })
    if (error && !error.message.toLowerCase().includes('already exists')) {
      return Response.json({ error: `Storage bucket setup failed: ${error.message}` }, { status: 500 })
    }
  }

  let uploadKind = purpose ? 'audio' : kind
  let extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
  let contentType = file.type || (extension === 'gif' ? 'image/gif' : extension === 'webp' ? 'image/webp' : 'application/octet-stream')
  let buffer = Buffer.from(await file.arrayBuffer())
  let extracted = false
  if (purpose || kind === 'audio') {
    try {
      const result = await extractAudio(file)
      buffer = result.buffer
      contentType = result.contentType
      extension = result.extension
      uploadKind = 'audio'
      extracted = result.extracted
    } catch (error: any) {
      if (purpose && (kind === 'video' || kind === 'unknown')) {
        const noAudio = error?.code === 'NO_AUDIO_STREAM'
        return Response.json({
          error: noAudio
            ? 'This video contains no audio track. Upload the original video with sound, or choose an audio file.'
            : 'This video has audio, but extraction failed on the server. Try MP4/MOV again or upload an MP3/M4A file.',
          code: noAudio ? 'NO_AUDIO_STREAM' : 'AUDIO_EXTRACTION_FAILED',
        }, { status: 422 })
      }
      // Direct audio files remain uploadable if conversion is unavailable.
    }
  }
  const path = `users/${safeSegment(userId)}/profile/${uploadKind}/${Date.now()}-${crypto.randomUUID()}.${extension}`
  const storage = supabase.storage.from(PROFILE_MEDIA_BUCKET)
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
