import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { language, strings } = await request.json().catch(() => ({}))
  if (!language || language === 'en' || !strings || typeof strings !== 'object') {
    return Response.json(strings || {})
  }

  const entries = Object.entries(strings).slice(0, 120)
  const translated = await Promise.all(entries.map(async ([key, value]) => {
    try {
      const url = new URL('https://translate.googleapis.com/translate_a/single')
      url.searchParams.set('client', 'gtx')
      url.searchParams.set('sl', 'en')
      url.searchParams.set('tl', String(language).slice(0, 8))
      url.searchParams.set('dt', 't')
      url.searchParams.set('q', String(value))
      const response = await fetch(url, { next: { revalidate: 86400 } })
      const data = await response.json()
      return [key, Array.isArray(data?.[0]) ? data[0].map((part: unknown[]) => part[0]).join('') : value]
    } catch {
      return [key, value]
    }
  }))
  return Response.json(Object.fromEntries(translated))
}
