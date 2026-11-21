import network from "../data/network.json" with { type: "json" }
import { parseSchedule, type ParsedSchedule } from "./schedule.ts"
import { readArrivals, type Arrival } from "./trains.ts"

export const TRAIN_CACHE_KEY = "trains.json"
export const BATCH_SIZE = 40
export const CACHE_CONTROL = "public, max-age=30"

export type LineStation = { line: string; station: string }

export type CacheEntry = {
  fetchedAt: string
  ok: boolean
  payload?: unknown
  error?: string
}

export type TrainCache = {
  updatedAt: string
  entries: Record<string, CacheEntry>
}

export type CacheBucket = {
  get(key: string): Promise<{ text(): Promise<string> } | null>
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<unknown>
}

const stations = network.stations as { code: string; lines: string[] }[]

export function lineStationPairs(): LineStation[] {
  const pairs: LineStation[] = []
  for (const station of stations) {
    for (const line of station.lines) pairs.push({ line, station: station.code })
  }
  pairs.sort((a, b) => a.line.localeCompare(b.line) || a.station.localeCompare(b.station))
  return pairs
}

export function pairKey(pair: LineStation): string {
  return `${pair.line}-${pair.station}`
}

export function batchForTick(items: LineStation[], tick: number, size = BATCH_SIZE): LineStation[] {
  if (items.length === 0 || size <= 0) return []
  const count = Math.min(size, items.length)
  const start = (Math.floor(Math.abs(tick)) * count) % items.length
  return Array.from({ length: count }, (_, index) => items[(start + index) % items.length])
}

export function mtrScheduleUrl(line: string, station: string): string {
  const url = new URL("https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php")
  url.searchParams.set("line", line)
  url.searchParams.set("sta", station)
  url.searchParams.set("lang", "TC")
  return url.toString()
}

export function emptyTrainCache(updatedAt: string): TrainCache {
  return { updatedAt, entries: {} }
}

export function mergeCache(
  previous: TrainCache | null,
  updates: Record<string, CacheEntry>,
  updatedAt: string,
): TrainCache {
  const entries = { ...(previous?.entries ?? {}) }
  for (const [key, next] of Object.entries(updates)) {
    const prior = entries[key]
    if (!next.ok && prior?.payload) {
      entries[key] = { ...prior, fetchedAt: next.fetchedAt, ok: false, error: next.error }
    } else {
      entries[key] = next
    }
  }
  return { updatedAt, entries }
}

export function parseTrainCache(payload: unknown): TrainCache | null {
  if (!payload || typeof payload !== "object") return null
  const body = payload as { updatedAt?: unknown; entries?: unknown }
  if (typeof body.updatedAt !== "string" || !body.entries || typeof body.entries !== "object") return null
  return { updatedAt: body.updatedAt, entries: body.entries as Record<string, CacheEntry> }
}

export function cacheIsStale(doc: TrainCache, now = Date.now()): boolean {
  const fetched = Date.parse(doc.updatedAt)
  return !Number.isFinite(fetched) || now - fetched > 5 * 60_000
}

export function arrivalsFromCache(doc: TrainCache): Arrival[] {
  const arrivals: Arrival[] = []
  for (const [key, entry] of Object.entries(doc.entries)) {
    if (!entry.payload) continue
    const split = key.indexOf("-")
    if (split <= 0) continue
    arrivals.push(...readArrivals(entry.payload, key.slice(0, split), key.slice(split + 1)))
  }
  return arrivals
}

export function scheduleFromCache(
  doc: TrainCache,
  line: string,
  station: string,
  names: Record<string, string>,
  isTerminus: boolean,
  now = new Date(),
): ParsedSchedule | null {
  const entry = doc.entries[`${line}-${station}`]
  if (!entry?.payload) return null
  return parseSchedule(entry.payload, line, station, names, isTerminus, now)
}

export async function refreshTrainCache(
  bucket: CacheBucket,
  fetcher: typeof fetch,
  now = new Date(),
  pairs = lineStationPairs(),
): Promise<TrainCache> {
  const previousText = await bucket.get(TRAIN_CACHE_KEY)
  const previous = previousText ? parseTrainCache(JSON.parse(await previousText.text())) : null
  const tick = Math.floor(now.getTime() / 60_000)
  const batch = batchForTick(pairs, tick)
  const fetchedAt = now.toISOString()
  const updates: Record<string, CacheEntry> = {}
  for (const pair of batch) {
    const key = pairKey(pair)
    try {
      const response = await fetcher(mtrScheduleUrl(pair.line, pair.station))
      if (response.status === 429) {
        updates[key] = { fetchedAt, ok: false, error: "429" }
        break
      }
      if (!response.ok) {
        updates[key] = { fetchedAt, ok: false, error: String(response.status) }
        continue
      }
      updates[key] = { fetchedAt, ok: true, payload: await response.json() }
    } catch {
      updates[key] = { fetchedAt, ok: false, error: "network" }
    }
  }
  const next = mergeCache(previous, updates, fetchedAt)
  await bucket.put(TRAIN_CACHE_KEY, JSON.stringify(next), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: CACHE_CONTROL,
    },
  })
  return next
}
