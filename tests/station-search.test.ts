import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { searchStations } from "../src/lib/station-search.ts"
import type { Station } from "../src/lib/types.ts"

const stations = JSON.parse(readFileSync(new URL("../src/data/network.json", import.meta.url), "utf8"))
  .stations as Station[]

function codes(query: string) {
  return searchStations(stations, query).map((station) => station.code)
}

test("matches traditional Chinese and English station names", () => {
  assert.deepEqual(codes("中環"), ["CEN"])
  assert.deepEqual(codes("central"), ["CEN"])
  assert.deepEqual(codes("Admiralty"), ["ADM"])
  assert.deepEqual(codes("金鐘"), ["ADM"])
  assert.equal(codes("HKU")[0], "HKU")
  assert.equal(codes("香港大學")[0], "HKU")
})

test("matches partial names and the lai character variant", () => {
  assert.ok(codes("柴").includes("CHW"))
  assert.ok(codes("chai wan").includes("CHW"))
  assert.deepEqual(codes("荔枝角"), ["LCK"])
  assert.ok(codes("tsim sha").includes("ETS"))
  assert.deepEqual(codes("   "), [])
  assert.deepEqual(codes("nowhere"), [])
})

test("ranks a name that starts with the query ahead of one that only contains it", () => {
  const results = codes("hom")
  assert.equal(results[0], "HOM")
  assert.ok(results.indexOf("HUH") > 0)
})
