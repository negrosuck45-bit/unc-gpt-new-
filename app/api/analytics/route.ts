import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '@/lib/auth'

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

function requestedUserMatches(requestedUserId: string | null | undefined, sessionUserId: string) {
  return !requestedUserId || requestedUserId === sessionUserId
}

export async function GET(req: NextRequest) {
  const session = await getSession().catch(() => null)
  if (!session?.user?.sub) return Response.json({ error: 'Sign in is required.' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    if (!requestedUserMatches(searchParams.get('userId'), session.user.sub)) return Response.json({ error: 'Access denied.' }, { status: 403 })
    const period = ['24h', '7d', '30d', '90d'].includes(searchParams.get('period') || '') ? searchParams.get('period') : '7d'
    if (!supabase) return Response.json({ success: true, userId: session.user.sub, period, stats: { totalEvents: 0, eventsByType: {}, timeline: [], trends: { lastDay: 0, lastWeek: 0, total: 0 } }, configured: false })

    const { data: events, error } = await supabase
      .from('analytics')
      .select('event, created_at')
      .eq('user_id', session.user.sub)
      .order('created_at', { ascending: false })
      .limit(1000)
    if (error) {
      console.error('[analytics] read failed', error.code)
      return Response.json({ error: 'Analytics are temporarily unavailable.' }, { status: 500 })
    }

    const safeEvents = events || []
    return Response.json({
      success: true,
      userId: session.user.sub,
      period,
      stats: {
        totalEvents: safeEvents.length,
        eventsByType: groupBy(safeEvents, 'event'),
        timeline: generateTimeline(safeEvents),
        trends: calculateTrends(safeEvents),
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[analytics] read failed', error instanceof Error ? error.name : 'unknown error')
    return Response.json({ error: 'Analytics are temporarily unavailable.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession().catch(() => null)
  if (!session?.user?.sub) return Response.json({ error: 'Sign in is required.' }, { status: 401 })

  try {
    const body = await req.json()
    const requestedUserId = typeof body?.userId === 'string' ? body.userId : undefined
    const event = typeof body?.event === 'string' ? body.event.trim() : ''
    if (!requestedUserMatches(requestedUserId, session.user.sub)) return Response.json({ error: 'Access denied.' }, { status: 403 })
    if (!event || event.length > 80) return Response.json({ error: 'Invalid analytics event.' }, { status: 400 })
    if (!supabase) return Response.json({ success: true, configured: false })

    const metadata = body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {}
    const { error } = await supabase.from('analytics').insert({
      user_id: session.user.sub,
      event,
      metadata,
      created_at: new Date(),
    })
    if (error) {
      console.error('[analytics] write failed', error.code)
      return Response.json({ error: 'Analytics could not be recorded.' }, { status: 500 })
    }
    return Response.json({ success: true })
  } catch (error) {
    console.error('[analytics] write failed', error instanceof Error ? error.name : 'unknown error')
    return Response.json({ error: 'Analytics could not be recorded.' }, { status: 500 })
  }
}

function groupBy(arr: Array<Record<string, unknown>>, key: string): Record<string, number> {
  return arr.reduce<Record<string, number>>((acc, obj) => {
    const value = typeof obj[key] === 'string' ? obj[key] : 'unknown'
    acc[value] = (acc[value] || 0) + 1
    return acc
  }, {})
}

function generateTimeline(events: Array<Record<string, unknown>>): Array<{ date: string; count: number }> {
  const timeline: Record<string, number> = {}
  events.forEach((event) => {
    const timestamp = typeof event.created_at === 'string' || event.created_at instanceof Date ? new Date(event.created_at) : null
    if (!timestamp || Number.isNaN(timestamp.getTime())) return
    const date = timestamp.toLocaleDateString()
    timeline[date] = (timeline[date] || 0) + 1
  })
  return Object.entries(timeline).map(([date, count]) => ({ date, count }))
}

function calculateTrends(events: Array<Record<string, unknown>>): Record<string, number> {
  const now = Date.now()
  const recent = (milliseconds: number) => events.filter((event) => {
    const timestamp = new Date(String(event.created_at || '')).getTime()
    return Number.isFinite(timestamp) && timestamp > now - milliseconds
  }).length
  return { lastDay: recent(86_400_000), lastWeek: recent(604_800_000), total: events.length }
}
