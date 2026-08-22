import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.sub) return Response.json({ memories: [] }, { status: 401 })
  const supabase = getSupabaseAdmin()
  if (!supabase) return Response.json({ memories: [], configured: false })

  const query = request.nextUrl.searchParams.get('query')?.trim() || ''
  let builder = supabase
    .from('neural_memories')
    .select('id, content, memory_type, tags, importance, created_at, last_accessed_at')
    .eq('user_id', session.user.sub)
    .order('importance', { ascending: false })
    .order('last_accessed_at', { ascending: false })
    .limit(20)

  if (query) builder = builder.ilike('content', `%${query.replace(/[%_]/g, '')}%`)
  const { data, error } = await builder
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ memories: data || [], configured: true })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.sub) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  if (!supabase) return Response.json({ stored: false, configured: false })

  const body = await request.json()
  const content = String(body.content || '').trim()
  if (!content) return Response.json({ error: 'Memory content is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('neural_memories')
    .insert({
      user_id: session.user.sub,
      project_id: body.projectId ? String(body.projectId) : null,
      chat_id: body.chatId ? String(body.chatId) : null,
      content: content.slice(0, 12000),
      memory_type: body.memoryType || 'conversation',
      source: body.source || 'auto-summary',
      importance: Math.max(0, Math.min(1, Number(body.importance ?? 0.55))),
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 20).map(String) : [],
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    })
    .select('id')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ stored: true, id: data.id, configured: true })
}
