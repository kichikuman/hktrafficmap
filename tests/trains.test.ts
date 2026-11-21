import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { placeTrain, placeTrains, pointAlong, readArrivals, trainAt, trainSamples } from "../src/lib/trains.ts"

const fetchedAt = Date.parse("2026-11-21T06:40:00Z")

test("places a train part way along the segment it is approaching", () => {
  const train = placeTrain(
    { line: "ISL", station: "CEN", dest: "CHW", ttnt: 1, eta: "2026-11-21 14:41:00", viaRacecourse: false },
    fetchedAt,
  )
  assert.ok(train)
  if (!train) return
  assert.equal(train.toward, "CEN")
  const atFetch = trainAt(train, fetchedAt)
  const atStation = pointAlong(train.coordinates, 1).point
  const gap = Math.hypot(atFetch.point[0] - atStation[0], atFetch.point[1] - atStation[1])
  assert.ok(gap > 0.002, "a one-minute train should not sit on the station")
  const later = trainAt(train, fetchedAt + 60_000)
  const moved = Math.hypot(later.point[0] - atFetch.point[0], later.point[1] - atFetch.point[1])
  assert.ok(moved > 0.0005)
  assert.equal(trainAt(train, fetchedAt + 10 * 60_000).minutes, 0)
})

test("keeps one icon when the same arrival is reported twice", () => {
  const arrival = {
    line: "ISL",
    station: "CEN",
    dest: "CHW",
    ttnt: 1,
    eta: "2026-11-21 14:41:00",
    viaRacecourse: false,
  }
  assert.equal(placeTrains([arrival, { ...arrival }], fetchedAt).length, 1)
  const separated = placeTrains(
    [
      arrival,
      { ...arrival, ttnt: 8, eta: "2026-11-21 14:48:00" },
    ],
    fetchedAt,
  )
  assert.equal(separated.length, 2)
})

test("reads only verified trains and the racecourse flag", () => {
  const arrivals = readArrivals(
    {
      status: 1,
      data: {
        "EAL-SHT": {
          UP: [
            { dest: "LOW", ttnt: "3", valid: "Y", time: "2026-11-21 14:43:00", route: "RAC" },
            { dest: "LOW", ttnt: "6", valid: "N", time: "2026-11-21 14:46:00" },
          ],
          DOWN: [{ dest: "ADM", ttnt: "2", valid: "Y", time: "2026-11-21 14:42:00" }],
        },
      },
    },
    "EAL",
    "SHT",
  )
  assert.equal(arrivals.length, 2)
  assert.equal(arrivals[0]?.viaRacecourse, true)
  assert.equal(arrivals[1]?.dest, "ADM")
})

test("watches a short list of stops and still covers every route", () => {
  const file = JSON.parse(readFileSync(new URL("../src/data/train-routes.json", import.meta.url), "utf8")) as {
    sampleCount: number
    lines: Record<string, { routes: string[][]; segments: { from: string; to: string; minutes: number }[]; samples: string[] }>
  }
  assert.equal(trainSamples.length, file.sampleCount)
  assert.ok(file.sampleCount <= 45)
  assert.ok(file.sampleCount < 80)
  const windows: Record<string, number> = {
    ISL: 6, TWL: 6, KTL: 6, TKL: 6, TML: 12, EAL: 10, TCL: 10, AEL: 10, SIL: 30, DRL: 30,
  }
  for (const [code, line] of Object.entries(file.lines)) {
    const minutes = new Map(line.segments.map((segment) => [`${segment.from}|${segment.to}`, segment.minutes]))
    for (const route of line.routes) {
      const cumulative = [0]
      for (let index = 1; index < route.length; index += 1) {
        const forward = minutes.get(`${route[index - 1]}|${route[index]}`)
        const back = minutes.get(`${route[index]}|${route[index - 1]}`)
        assert.ok(forward ?? back, `${code} 缺少 ${route[index - 1]}-${route[index]}`)
        cumulative.push(cumulative[cumulative.length - 1] + (forward ?? back ?? 0))
      }
      for (let index = 0; index < route.length; index += 1) {
        const gap = Math.min(
          ...line.samples.filter((sample) => route.includes(sample)).map((sample) => Math.abs(cumulative[index] - cumulative[route.indexOf(sample)])),
        )
        assert.ok(gap <= windows[code], `${code} ${route[index]} 距離觀測站 ${gap} 分鐘`)
      }
    }
  }
})
