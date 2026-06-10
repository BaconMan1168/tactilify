import { NextRequest } from 'next/server'

const windows = new Map<string, number[]>()

export function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const cutoff = now - windowMs
  const hits = (windows.get(ip) ?? []).filter((t) => t > cutoff)
  if (hits.length >= limit) return false
  hits.push(now)
  windows.set(ip, hits)
  return true
}

export function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}
