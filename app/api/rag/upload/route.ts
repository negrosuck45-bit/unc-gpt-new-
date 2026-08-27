import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import pdfParse from 'pdf-parse'
import { getSession } from '@/lib/auth'

const MAX_PDF_BYTES = 10 * 1024 * 1024
const MAX_TEXT_CHARS = 500_000
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

function scopedProjectId(userId: string, projectId: unknown) {
  const project = String(projectId || '').trim()
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(project)) return null
  const tenant = createHash('sha256').update(`uncgpt-rag-tenant-v1:${userId}`).digest('hex').slice(0, 24)
  return `${tenant}:${project}`
}

export async function POST(req: NextRequest) {
  const session = await getSession().catch(() => null)
  if (!session?.user?.sub) return Response.json({ error: 'Sign in is required.' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const projectId = scopedProjectId(session.user.sub, formData.get('projectId'))
    if (!(file instanceof File) || !projectId) return Response.json({ error: 'Choose a valid PDF and project.' }, { status: 400 })
    if (file.type !== 'application/pdf' || file.size <= 0 || file.size > MAX_PDF_BYTES) {
      return Response.json({ error: 'PDF documents must be 10 MB or smaller.' }, { status: 415 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) return Response.json({ error: 'Choose a valid PDF document.' }, { status: 415 })
    const pdf = await pdfParse(buffer)
    const text = String(pdf.text || '').slice(0, MAX_TEXT_CHARS)
    if (!text.trim()) return Response.json({ error: 'This PDF does not contain readable text.' }, { status: 422 })
    if (!supabase) return Response.json({ error: 'RAG storage is not configured.' }, { status: 503 })

    const hfApiKey = process.env.HF_API_KEY
    if (!hfApiKey) return Response.json({ error: 'Document indexing is not configured.' }, { status: 503 })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    let embedding: unknown
    try {
      const embeddingResponse = await fetch('https://api-inference.huggingface.co/pipeline/feature-extraction', {
        headers: { Authorization: `Bearer ${hfApiKey}`, 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({ inputs: text.slice(0, 512) }),
        signal: controller.signal,
      })
      if (!embeddingResponse.ok) return Response.json({ error: 'Document indexing is temporarily unavailable.' }, { status: 502 })
      embedding = await embeddingResponse.json()
    } finally {
      clearTimeout(timeout)
    }
    if (!Array.isArray(embedding) || !Array.isArray(embedding[0])) return Response.json({ error: 'Document indexing returned an invalid result.' }, { status: 502 })

    const { data, error } = await supabase
      .from('rag_documents')
      .insert({
        project_id: projectId,
        filename: file.name.replace(/[\r\n]/g, ' ').slice(0, 180),
        content: text,
        embedding: embedding[0],
        created_at: new Date(),
      })
      .select('id')
      .single()
    if (error) {
      console.error('[rag/upload] insert failed', error.code)
      return Response.json({ error: 'Document storage failed.' }, { status: 500 })
    }
    return Response.json({ success: true, documentId: data?.id || null })
  } catch (error) {
    console.error('[rag/upload] failed', error instanceof Error ? error.name : 'unknown error')
    return Response.json({ error: 'Document upload failed.' }, { status: 500 })
  }
}
