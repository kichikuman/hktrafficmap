import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const network = JSON.parse(readFileSync(new URL("../src/data/network.json", import.meta.url), "utf8"))
const cameras = JSON.parse(readFileSync(new URL("../src/data/cameras.json", import.meta.url), "utf8"))

test("covers the operating heavy-rail network and every snapshot point", () => {
  assert.equal(network.stations.length, 98)
  assert.equal(network.lines.length, 10)
  assert.equal(cameras.length, 1013)

  const codes = new Set(network.lines.map((line: { code: string }) => line.code))
  assert.deepEqual(
    [...codes].sort(),
    ["AEL", "DRL", "EAL", "ISL", "KTL", "SIL", "TCL", "TKL", "TML", "TWL"],
  )

  const racecourse = network.stations.find((station: { code: string }) => station.code === "RAC")
  assert.equal(racecourse.nameZh, "馬場")
  assert.deepEqual(racecourse.terminusLines, ["EAL"])

  for (const station of network.stations) {
    assert.ok(station.lon > 113.8 && station.lon < 114.5)
    assert.ok(station.lat > 22.15 && station.lat < 22.58)
    assert.ok(station.lines.length > 0)
    for (const line of station.lines) assert.ok(codes.has(line))
  }

  const keys = new Set<string>()
  for (const camera of cameras) {
    assert.equal(keys.has(camera.key), false)
    keys.add(camera.key)
    assert.ok(camera.description.length > 0)
    assert.match(camera.url, /^https:\/\/tdcctv\.data\.one\.gov\.hk\//)
    assert.ok(camera.lon > 113.8 && camera.lon < 114.5)
    assert.ok(camera.lat > 22.15 && camera.lat < 22.58)
  }

  const gap = (line: { coordinates: number[][][] }, lon: number, lat: number) => {
    let nearest = Infinity
    for (const part of line.coordinates) {
      for (let index = 1; index < part.length; index += 1) {
        const [startLon, startLat] = part[index - 1]
        const [endLon, endLat] = part[index]
        const dx = endLon - startLon
        const dy = endLat - startLat
        const denom = dx * dx + dy * dy
        const ratio = denom === 0 ? 0 : Math.max(0, Math.min(1, ((lon - startLon) * dx + (lat - startLat) * dy) / denom))
        nearest = Math.min(nearest, Math.hypot(lon - (startLon + ratio * dx), lat - (startLat + ratio * dy)))
      }
    }
    return nearest
  }

  for (const line of network.lines) {
    const pointCount = line.coordinates.reduce(
      (count: number, part: number[][]) => count + part.length,
      0,
    )
    assert.ok(pointCount > 40, `${line.code} 路軌點太少，仍像直線`)
    for (const station of network.stations.filter((item: { lines: string[] }) => item.lines.includes(line.code))) {
      assert.ok(gap(line, station.lon, station.lat) < 0.0025, `${line.code} 沒有貼近 ${station.nameZh}`)
    }
  }

  const eastRail = network.lines.find((line: { code: string }) => line.code === "EAL")
  assert.ok(gap(eastRail, racecourse.lon, racecourse.lat) < 0.0025)
})
