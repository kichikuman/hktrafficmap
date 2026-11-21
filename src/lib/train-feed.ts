import { arrivalsFromCache, cacheIsStale, parseTrainCache, scheduleFromCache, type TrainCache } from "@/lib/train-cache"
import { fetchSchedule, type ParsedSchedule } from "@/lib/schedule"
import { readArrivals, trainSamples, type Arrival } from "@/lib/trains"

const GAP_MS = 200
const CLIENT_TTL_MS = 120_000

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException("The operation was aborted.", "AbortError"))
    }
    if (signal.aborted) abort()
    else signal.addEventListener("abort", abort, { once: true })
  })
}

export function trainCacheUrl(): string {
  const value = process.env.NEXT_PUBLIC_TRAIN_CACHE_URL?.trim() ?? ""
  return value.startsWith("https://") ? value : ""
}

export function trainRefreshMs(): number {
  return trainCacheUrl() ? 120_000 : 90_000
}

let memory: { at: number; doc: TrainCache } | null = null
let inflight: Promise<TrainCache | null> | null = null

export function resetTrainCacheMemory(): void {
  memory = null
  inflight = null
}

export async function loadTrainCache(): Promise<TrainCache | null> {
  const url = trainCacheUrl()
  if (!url) return null
  if (memory && Date.now() - memory.at < CLIENT_TTL_MS) return memory.doc
  if (!inflight) {
    inflight = fetch(url)
      .then(async (response) => {
        if (!response.ok) return null
        return parseTrainCache(await response.json())
      })
      .then((doc) => {
        if (doc) memory = { at: Date.now(), doc }
        return doc
      })
      .catch(() => null)
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

async function fetchArrivalsDirect(signal: AbortSignal): Promise<{ arrivals: Arrival[]; limited: boolean; ok: number }> {
  const arrivals: Arrival[] = []
  let ok = 0
  for (const [index, sample] of trainSamples.entries()) {
    if (signal.aborted) break
    const url = new URL("https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php")
    url.searchParams.set("line", sample.line)
    url.searchParams.set("sta", sample.station)
    try {
      const response = await fetch(url, { signal })
      if (response.status === 429) return { arrivals, limited: true, ok }
      if (response.ok) {
        ok += 1
        arrivals.push(...readArrivals(await response.json(), sample.line, sample.station))
      }
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error
    }
    if (index < trainSamples.length - 1) await wait(GAP_MS, signal)
  }
  return { arrivals, limited: false, ok }
}

export async function fetchArrivals(signal: AbortSignal): Promise<{ arrivals: Arrival[]; limited: boolean; ok: number }> {
  if (signal.aborted) return { arrivals: [], limited: false, ok: 0 }
  if (!trainCacheUrl()) return fetchArrivalsDirect(signal)
  const doc = await loadTrainCache()
  if (signal.aborted) return { arrivals: [], limited: false, ok: 0 }
  if (!doc) return { arrivals: [], limited: true, ok: 0 }
  const arrivals = arrivalsFromCache(doc)
  return { arrivals, limited: cacheIsStale(doc), ok: arrivals.length > 0 ? 1 : 0 }
}

export async function fetchStationSchedule(
  line: string,
  station: string,
  names: Record<string, string>,
  isTerminus: boolean,
  signal: AbortSignal,
): Promise<ParsedSchedule | null> {
  if (signal.aborted) return null
  if (!trainCacheUrl()) return fetchSchedule(line, station, names, isTerminus, signal)
  try {
    const doc = await loadTrainCache()
    if (signal.aborted) return null
    if (!doc) return { state: "error", title: "暫時取不到到站資料。" }
    return scheduleFromCache(doc, line, station, names, isTerminus) ?? { state: "error", title: "暫時取不到到站資料。" }
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) return null
    return { state: "error", title: "暫時取不到到站資料。" }
  }
}
