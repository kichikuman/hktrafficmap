import assert from "node:assert/strict"
import test from "node:test"
import {
  batchForTick,
  cacheIsStale,
  lineStationPairs,
  mergeCache,
  parseTrainCache,
  arrivalsFromCache,
  refreshTrainCache,
  scheduleFromCache,
  type CacheBucket,
  type TrainCache,
} from "../src/lib/train-cache.ts"

const now = new Date("2026-11-21T07:00:00Z")

test("covers every heavy-rail stop, including the racecourse", () => {
  const pairs = lineStationPairs()
  assert.ok(pairs.length >= 110)
  assert.ok(pairs.length <= 130)
  assert.ok(pairs.some((pair) => pair.line === "EAL" && pair.station === "RAC"))
  assert.ok(pairs.some((pair) => pair.line === "ISL" && pair.station === "CEN"))
})

test("rotates 40 stops per minute and reaches the whole list", () => {
  const pairs = lineStationPairs()
  const seen = new Set<string>()
  const ticks = Math.ceil(pairs.length / 40)
  for (let tick = 0; tick < ticks; tick += 1) {
    const batch = batchForTick(pairs, tick)
    assert.ok(batch.length <= 40)
    for (const pair of batch) seen.add(`${pair.line}-${pair.station}`)
  }
  assert.equal(seen.size, pairs.length)
})

test("keeps the last good timetable when a later fetch fails", () => {
  const previous: TrainCache = {
    updatedAt: "2026-11-21T06:00:00.000Z",
    entries: {
      "ISL-CEN": {
        fetchedAt: "2026-11-21T06:00:00.000Z",
        ok: true,
        payload: { status: 1 },
      },
    },
  }
  const merged = mergeCache(
    previous,
    { "ISL-CEN": { fetchedAt: "2026-11-21T07:00:00.000Z", ok: false, error: "429" } },
    "2026-11-21T07:00:00.000Z",
  )
  assert.equal(merged.entries["ISL-CEN"]?.ok, false)
  assert.equal(merged.entries["ISL-CEN"]?.error, "429")
  assert.deepEqual(merged.entries["ISL-CEN"]?.payload, { status: 1 })
  assert.equal(cacheIsStale(merged, Date.parse("2026-11-21T07:06:00.000Z")), true)
  assert.equal(cacheIsStale(merged, Date.parse("2026-11-21T07:01:00.000Z")), false)
})

test("reads a station board and train list from the shared file", () => {
  const payload = {
    status: 1,
    isdelay: "N",
    sys_time: "2026-11-21 15:00:00",
    data: {
      "ISL-CEN": {
        sys_time: "2026-11-21 15:00:00",
        UP: [{ seq: "1", dest: "CHW", plat: "3", time: "2026-11-21 15:02:00", ttnt: "2", valid: "Y" }],
        DOWN: [],
      },
    },
  }
  const doc: TrainCache = {
    updatedAt: "2026-11-21T07:00:00.000Z",
    entries: { "ISL-CEN": { fetchedAt: "2026-11-21T07:00:00.000Z", ok: true, payload } },
  }
  const board = scheduleFromCache(doc, "ISL", "CEN", { CHW: "柴灣" }, false, now)
  assert.equal(board?.state, "board")
  if (board?.state === "board") assert.equal(board.directions[0][0]?.destination, "往柴灣")
  assert.equal(arrivalsFromCache(doc)[0]?.dest, "CHW")
  assert.equal(scheduleFromCache(doc, "TWL", "CEN", {}, false, now), null)
  assert.equal(parseTrainCache({ updatedAt: "x" }), null)
})

test("stops a refresh batch on the first rate limit and writes the merged file", async () => {
  const stored: { body?: string; cacheControl?: string } = {}
  const bucket: CacheBucket = {
    async get() {
      return {
        async text() {
          return JSON.stringify({
            updatedAt: "2026-11-21T06:59:00.000Z",
            entries: {
              "TWL-TST": { fetchedAt: "2026-11-21T06:59:00.000Z", ok: true, payload: { status: 1, data: {} } },
            },
          })
        },
      }
    },
    async put(_key, value, options) {
      stored.body = value
      stored.cacheControl = options?.httpMetadata?.cacheControl
    },
  }
  const pairs = [
    { line: "ISL", station: "CEN" },
    { line: "TWL", station: "TST" },
  ]
  const fetcher = (async (input: RequestInfo | URL) => {
    const station = new URL(String(input)).searchParams.get("sta")
    if (station === "TST") return new Response("busy", { status: 429 })
    return Response.json({ status: 1, data: { "ISL-CEN": { UP: [], DOWN: [] } } })
  }) as typeof fetch
  const next = await refreshTrainCache(bucket, fetcher, now, pairs)
  assert.equal(next.entries["ISL-CEN"]?.ok, true)
  assert.equal(next.entries["TWL-TST"]?.ok, false)
  assert.equal(next.entries["TWL-TST"]?.error, "429")
  assert.deepEqual((next.entries["TWL-TST"]?.payload as { status: number }).status, 1)
  assert.equal(stored.cacheControl, "public, max-age=30")
  assert.equal(parseTrainCache(JSON.parse(stored.body ?? ""))?.updatedAt, now.toISOString())
})
