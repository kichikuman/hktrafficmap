import network from "../data/network.json" with { type: "json" }
import { parseSchedule, type ParsedSchedule } from "./schedule.ts"
import { readArrivals, type Arrival } from "./trains.ts"

export const TRAIN_CACHE_KEY = "trains.json"
export const BATCH_SIZE = 40
export const CACHE_CONTROL = "public, max-age=120, stale-while-revalidate=300"
export const RETRY_AFTER_MS = 10 * 60_000
export const REQUEST_GAP_MS = 200

export type LineStation = { line: string; station: string }

export type SlimTrain = {
  dest: string
  ttnt: string
  time?: string
  plat?: string
  seq?: string
  valid?: string
  route?: string
}

export type CacheEntry = {
  fetchedAt: string
  ok: boolean
  payload?: unknown
  error?: string
  status?: number
  delayed?: boolean
  sysTime?: string
  message?: string
  url?: string
  up?: SlimTrain[]
  down?: SlimTrain[]
}

export type TrainCache = {
  updatedAt: string
  retryAt?: string
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

function hasTimetable(entry: CacheEntry | undefined): boolean {
  return Boolean(entry && (entry.payload || entry.up || entry.down || entry.status !== undefined || entry.message))
}

export function rotationWindowMs(count: number, size = BATCH_SIZE): number {
  if (count <= 0) return 60_000
  return Math.ceil(count / size) * 60_000
}

export function stopsDue(
  pairs: LineStation[],
  entries: Record<string, CacheEntry>,
  now: number,
  tick: number,
  size = BATCH_SIZE,
): LineStation[] {
  if (pairs.length === 0 || size <= 0) return []
  const freshFor = rotationWindowMs(pairs.length, size)
  const start = (Math.floor(Math.abs(tick)) * Math.min(size, pairs.length)) % pairs.length
  const due: LineStation[] = []
  for (let index = 0; index < pairs.length && due.length < size; index += 1) {
    const pair = pairs[(start + index) % pairs.length]
    const entry = entries[pairKey(pair)]
    const fetched = entry ? Date.parse(entry.fetchedAt) : Number.NaN
    const fresh = Boolean(entry?.ok) && Number.isFinite(fetched) && now - fetched < freshFor
    if (!fresh) due.push(pair)
  }
  return due
}

export function mergeCache(
  previous: TrainCache | null,
  updates: Record<string, CacheEntry>,
  updatedAt: string,
): TrainCache {
  const entries = { ...(previous?.entries ?? {}) }
  for (const [key, next] of Object.entries(updates)) {
    const prior = entries[key]
    if (!next.ok && hasTimetable(prior)) {
      entries[key] = { ...prior, fetchedAt: next.fetchedAt, ok: false, error: next.error }
    } else {
      entries[key] = next
    }
  }
  return { updatedAt, entries, retryAt: previous?.retryAt }
}

export function parseTrainCache(payload: unknown): TrainCache | null {
  if (!payload || typeof payload !== "object") return null
  const body = payload as { updatedAt?: unknown; entries?: unknown }
  if (typeof body.updatedAt !== "string" || !body.entries || typeof body.entries !== "object") return null
  const retryAt = "retryAt" in body && typeof body.retryAt === "string" ? body.retryAt : undefined
  return { updatedAt: body.updatedAt, ...(retryAt ? { retryAt } : {}), entries: body.entries as Record<string, CacheEntry> }
}

export function cacheIsStale(doc: TrainCache, now = Date.now()): boolean {
  const retryAt = doc.retryAt ? Date.parse(doc.retryAt) : Number.NaN
  if (Number.isFinite(retryAt) && retryAt > now) return true
  const fetched = Date.parse(doc.updatedAt)
  return !Number.isFinite(fetched) || now - fetched > 5 * 60_000
}

type RawBody = {
  status?: number | string
  isdelay?: string | null
  message?: string
  url?: string
  sys_time?: string
  data?: Record<string, { sys_time?: string; UP?: SlimTrain[]; DOWN?: SlimTrain[] }>
}

function slimTrains(trains: SlimTrain[] | undefined): SlimTrain[] | undefined {
  if (!Array.isArray(trains)) return undefined
  const slim = trains
    .filter((train) => train.dest)
    .map((train) => ({
      dest: train.dest,
      ttnt: train.ttnt ?? "",
      ...(train.time ? { time: train.time } : {}),
      ...(train.plat ? { plat: train.plat } : {}),
      ...(train.seq ? { seq: train.seq } : {}),
      ...(train.valid ? { valid: train.valid } : {}),
      ...(train.route ? { route: train.route } : {}),
    }))
  return slim.length > 0 ? slim : undefined
}

export function entryFromPayload(body: unknown, line: string, station: string, fetchedAt: string): CacheEntry {
  const raw = (body ?? {}) as RawBody
  const block = raw.data?.[`${line}-${station}`] ?? {}
  const status = Number(raw.status)
  return {
    fetchedAt,
    ok: status === 1,
    ...(Number.isFinite(status) ? { status } : {}),
    ...(String(raw.isdelay ?? "").toUpperCase() === "Y" ? { delayed: true } : {}),
    ...((block.sys_time && block.sys_time !== "-" ? block.sys_time : raw.sys_time)
      ? { sysTime: block.sys_time && block.sys_time !== "-" ? block.sys_time : raw.sys_time }
      : {}),
    ...(raw.message ? { message: raw.message } : {}),
    ...(raw.url ? { url: raw.url } : {}),
    ...(slimTrains(block.UP) ? { up: slimTrains(block.UP) } : {}),
    ...(slimTrains(block.DOWN) ? { down: slimTrains(block.DOWN) } : {}),
  }
}

function payloadFromEntry(key: string, entry: CacheEntry): unknown {
  if (entry.payload) return entry.payload
  return {
    status: entry.status ?? (entry.ok ? 1 : 0),
    isdelay: entry.delayed ? "Y" : "N",
    message: entry.message,
    url: entry.url,
    sys_time: entry.sysTime,
    data: {
      [key]: {
        sys_time: entry.sysTime,
        UP: entry.up ?? [],
        DOWN: entry.down ?? [],
      },
    },
  }
}

export function arrivalsFromCache(doc: TrainCache): Arrival[] {
  const arrivals: Arrival[] = []
  for (const [key, entry] of Object.entries(doc.entries)) {
    if (!entry.up && !entry.down && !entry.payload) continue
    const split = key.indexOf("-")
    if (split <= 0) continue
    arrivals.push(...readArrivals(payloadFromEntry(key, entry), key.slice(0, split), key.slice(split + 1)))
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
  const key = `${line}-${station}`
  const entry = doc.entries[key]
  if (!hasTimetable(entry)) return null
  return parseSchedule(payloadFromEntry(key, entry), line, station, names, isTerminus, now)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function refreshTrainCache(
  bucket: CacheBucket,
  fetcher: typeof fetch,
  now = new Date(),
  pairs = lineStationPairs(),
  gapMs = REQUEST_GAP_MS,
): Promise<TrainCache> {
  const previousText = await bucket.get(TRAIN_CACHE_KEY)
  const previous = previousText ? parseTrainCache(JSON.parse(await previousText.text())) : null
  const nowMs = now.getTime()
  const retryAt = previous?.retryAt ? Date.parse(previous.retryAt) : Number.NaN
  if (previous && Number.isFinite(retryAt) && retryAt > nowMs) return previous

  const tick = Math.floor(nowMs / 60_000)
  const due = stopsDue(pairs, previous?.entries ?? {}, nowMs, tick)
  if (due.length === 0) return previous ?? emptyTrainCache(new Date(nowMs - 6 * 60_000).toISOString())

  const fetchedAt = now.toISOString()
  const updates: Record<string, CacheEntry> = {}
  let succeeded = false
  let rateLimited = false
  for (const [index, pair] of due.entries()) {
    const key = pairKey(pair)
    try {
      const response = await fetcher(mtrScheduleUrl(pair.line, pair.station))
      if (response.status === 429) {
        updates[key] = { fetchedAt, ok: false, error: "429" }
        rateLimited = true
        break
      }
      if (!response.ok) {
        updates[key] = { fetchedAt, ok: false, error: String(response.status) }
      } else {
        const entry = entryFromPayload(await response.json(), pair.line, pair.station, fetchedAt)
        updates[key] = entry.status === 1 ? entry : { ...entry, ok: false, error: entry.message ?? "status" }
        if (entry.status === 1) succeeded = true
      }
    } catch {
      updates[key] = { fetchedAt, ok: false, error: "network" }
    }
    if (gapMs > 0 && index < due.length - 1 && !rateLimited) await wait(gapMs)
  }

  const updatedAt = succeeded
    ? fetchedAt
    : (previous?.updatedAt ?? new Date(nowMs - 6 * 60_000).toISOString())
  const next = mergeCache(previous, updates, updatedAt)
  next.retryAt = rateLimited ? new Date(nowMs + RETRY_AFTER_MS).toISOString() : undefined
  await bucket.put(TRAIN_CACHE_KEY, JSON.stringify(next), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: CACHE_CONTROL,
    },
  })
  return next
}
