
export type ImageSearchState =
  | { status: 'empty'; requestId: string }
  | { status: 'error'; message: string; requestId: string }
  | { status: 'ready'; provider:'course'|'unsplash';url: string; alt: string; pageUrl: string; author: string; licenseUrl?: string; requestId: string }

export async function searchClassroomImage(
  query: string,
  subjectId?:string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImageSearchState> {
  const trimmed = query.trim()
  const requestId = crypto.randomUUID()
  if (!trimmed) {
    return { status: 'empty', requestId }
  }
  try {
    const response=await fetchImpl('/api/class/image-search',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Request-Id':requestId},body:JSON.stringify({query:trimmed,subjectId})});
    if (!response.ok) {
      return { status: 'error', message: `图片检索失败（${response.status}）`, requestId }
    }
    const payload: unknown = await response.json()
    const results = readResults(payload)
    const first = results[0]
    if (!first) {
      return { status: 'empty', requestId }
    }
    return { status: 'ready', ...first, alt: first.alt || trimmed, requestId }
  } catch {
    return { status: 'error', message: '图片检索失败', requestId }
  }
}

function readResults(
  payload: unknown,
): readonly { provider:'course'|'unsplash';url: string; alt: string; pageUrl: string; author: string;licenseUrl?:string }[] {
  if (typeof payload !== 'object' || payload === null) return []
  const results = (payload as { results?: unknown }).results
  if (!Array.isArray(results)) return []
  const out: { provider:'course'|'unsplash';url: string; alt: string; pageUrl: string; author: string;licenseUrl?:string }[] = []
  for (const item of results) {
    if (typeof item !== 'object' || item === null) continue
    const record=item as {provider?:unknown;url?:unknown;urls?:{small?:unknown};pageUrl?:unknown;alt?:unknown;alt_description?:unknown;author?:unknown;licenseUrl?:unknown}
    const provider=record.provider==='course'?'course':'unsplash'
    const url=provider==='course'?record.url:record.urls?.small
    if (typeof url !== 'string' || url.length === 0) continue
    const alt = record.alt??record.alt_description
    const pageUrl = record.pageUrl
    const author = record.author
    if (typeof pageUrl !== 'string' || (provider==='unsplash'?!pageUrl.startsWith('https://unsplash.com/'):!pageUrl.startsWith('/'))) continue
    out.push({
      url,
      provider,
      alt: typeof alt === 'string' ? alt : '',
      pageUrl,
      author: typeof author === 'string' ? author : 'Unsplash',
      ...(provider==='unsplash'?{licenseUrl:'https://unsplash.com/license'}:{}),
    })
  }
  return out
}
