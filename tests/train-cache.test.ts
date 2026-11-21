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
        status: 1,
        up: [{ dest: "CHW", ttnt: "2", valid: "Y" }],
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
  assert.equal(merged.entries["ISL-CEN"]?.up?.[0]?.dest, "CHW")
  assert.equal(cacheIsStale(merged, Date.parse("2026-11-21T07:06:00.000Z")), true)
  assert.equal(cacheIsStale(merged, Date.parse("2026-11-21T07:01:00.000Z")), false)
})

test("reads a station board and train list from the shared file", () => {
  const doc: TrainCache = {
    updatedAt: "2026-11-21T07:00:00.000Z",
    entries: {
      "ISL-CEN": {
        fetchedAt: "2026-11-21T07:00:00.000Z",
        ok: true,
        status: 1,
        sysTime: "2026-11-21 15:00:00",
        up: [{ seq: "1", dest: "CHW", plat: "3", time: "2026-11-21 15:02:00", ttnt: "2", valid: "Y" }],
      },
    },
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
              "TWL-TST": {
                fetchedAt: "2026-11-21T06:00:00.000Z",
                ok: true,
                status: 1,
                up: [{ dest: "CEN", ttnt: "1", valid: "Y" }],
              },
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
  const next = await refreshTrainCache(bucket, fetcher, now, pairs, 0)
  assert.equal(next.entries["ISL-CEN"]?.ok, true)
  assert.equal(next.entries["TWL-TST"]?.ok, false)
  assert.equal(next.entries["TWL-TST"]?.error, "429")
  assert.equal(next.entries["TWL-TST"]?.up?.[0]?.dest, "CEN")
  assert.equal(next.retryAt, "2026-11-21T07:10:00.000Z")
  assert.equal(cacheIsStale(next, now.getTime()), true)
  assert.equal(stored.cacheControl, "public, max-age=120, stale-while-revalidate=300")
  assert.equal(parseTrainCache(JSON.parse(stored.body ?? ""))?.updatedAt, now.toISOString())
})

test("does not call MTR during a cooldown", async () => {
  let called = false
  let written = false
  const bucket: CacheBucket = {
    async get() {
      return {
        async text() {
          return JSON.stringify({
            updatedAt: "2026-11-21T06:50:00.000Z",
            retryAt: "2026-11-21T07:10:00.000Z",
            entries: {},
          })
        },
      }
    },
    async put() {
      written = true
    },
  }
  const fetcher = (() => {
    called = true
    return Promise.resolve(new Response("no"))
  }) as typeof fetch
  const next = await refreshTrainCache(bucket, fetcher, now, [{ line: "ISL", station: "CEN" }], 0)
  assert.equal(called, false)
  assert.equal(written, false)
  assert.equal(next.retryAt, "2026-11-21T07:10:00.000Z")
})

test("skips a stop that was fetched inside the rotation window", async () => {
  const asked: string[] = []
  const bucket: CacheBucket = {
    async get() {
      return {
        async text() {
          return JSON.stringify({
            updatedAt: "2026-11-21T06:59:30.000Z",
            entries: {
              "ISL-CEN": { fetchedAt: "2026-11-21T06:59:30.000Z", ok: true, status: 1 },
            },
          })
        },
      }
    },
    async put() {},
  }
  const fetcher = (async (input: RequestInfo | URL) => {
    const station = new URL(String(input)).searchParams.get("sta") ?? ""
    asked.push(station)
    return Response.json({ status: 1, data: { [`TWL-${station}`]: { UP: [], DOWN: [] } } })
  }) as typeof fetch
  await refreshTrainCache(
    bucket,
    fetcher,
    now,
    [
      { line: "ISL", station: "CEN" },
      { line: "TWL", station: "TST" },
    ],
    0,
  )
  assert.deepEqual(asked, ["TST"])
})

test("leaves updatedAt unchanged when every fetch is rate limited", async () => {
  const bucket: CacheBucket = {
    async get() {
      return {
        async text() {
          return JSON.stringify({
            updatedAt: "2026-11-21T06:00:00.000Z",
            entries: {},
          })
        },
      }
    },
    async put() {},
  }
  const fetcher = (async () => new Response("busy", { status: 429 })) as typeof fetch
  const next = await refreshTrainCache(bucket, fetcher, now, [{ line: "ISL", station: "CEN" }], 0)
  assert.equal(next.updatedAt, "2026-11-21T06:00:00.000Z")
  assert.equal(cacheIsStale(next, now.getTime()), true)
})
