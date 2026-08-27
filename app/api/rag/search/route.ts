import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '@/lib/auth'

const MAX_QUERY_CHARS = 2_000
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
    const body = await req.json()
    const query = typeof body?.query === 'string' ? body.query.trim() : ''
    const projectId = scopedProjectId(session.user.sub, body?.projectId)
    if (!query || query.length > MAX_QUERY_CHARS || !projectId) return Response.json({ error: 'Enter a valid search and project.' }, { status: 400 })
    if (!supabase) return Response.json({ results: [], configured: false })

    const hfApiKey = process.env.HF_API_KEY
    if (!hfApiKey) return Response.json({ results: [], configured: false })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    let embedding: unknown
    try {
      const embeddingResponse = await fetch('https://api-inference.huggingface.co/pipeline/feature-extraction', {
        headers: { Authorization: `Bearer ${hfApiKey}`, 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({ inputs: query }),
        signal: controller.signal,
      })
      if (!embeddingResponse.ok) return Response.json({ error: 'Search indexing is temporarily unavailable.' }, { status: 502 })
      embedding = await embeddingResponse.json()
    } finally {
      clearTimeout(timeout)
    }
    if (!Array.isArray(embedding) || !Array.isArray(embedding[0])) return Response.json({ error: 'Search indexing returned an invalid result.' }, { status: 502 })

    const { data, error } = await supabase.rpc('search_rag', {
      query_embedding: embedding[0],
      project_id: projectId,
      match_threshold: 0.5,
      match_count: 5,
    })
    if (error) {
      console.error('[rag/search] query failed', error.code)
      return Response.json({ error: 'Document search failed.' }, { status: 500 })
    }
    return Response.json({ results: data || [] })
  } catch (error) {
    console.error('[rag/search] failed', error instanceof Error ? error.name : 'unknown error')
    return Response.json({ error: 'Document search failed.' }, { status: 500 })
  }
}
