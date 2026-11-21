import { readArrivals, trainSamples, type Arrival } from "@/lib/trains"

const GAP_MS = 200

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

export async function fetchArrivals(signal: AbortSignal): Promise<{ arrivals: Arrival[]; limited: boolean; ok: number }> {
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
      if (signal.aborted) throw error
    }
    if (index < trainSamples.length - 1) await wait(GAP_MS, signal)
  }
  return { arrivals, limited: false, ok }
}
