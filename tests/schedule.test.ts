import assert from "node:assert/strict"
import test from "node:test"
import { formatUpdated, parseSchedule } from "../src/lib/schedule.ts"
import { isServicePlaceholder } from "../src/lib/snapshot.ts"

const now = new Date("2026-11-21T02:40:00Z")
const names = { CHW: "柴灣", KET: "堅尼地城", POA: "寶琳" }

test("drops an unverified train and says the other direction is empty", () => {
  const board = parseSchedule(
    {
      status: 1,
      isdelay: "N",
      sys_time: "2026-11-21 10:32:13",
      data: {
        "ISL-CEN": {
          sys_time: "2026-11-21 10:32:13",
          UP: [
            { seq: "2", dest: "CHW", plat: "3", time: "2026-11-21 10:36:00", ttnt: "4", valid: "Y" },
            { seq: "1", dest: "CHW", plat: "3", time: "2026-11-21 10:32:00", ttnt: "0", valid: "Y" },
          ],
          DOWN: [{ seq: "1", dest: "KET", plat: "1", time: "2026-11-21 10:33:00", ttnt: "1", valid: "N" }],
        },
      },
    },
    "ISL",
    "CEN",
    names,
    false,
    now,
  )
  assert.equal(board.state, "board")
  if (board.state !== "board") return
  assert.equal(board.updatedAt, "10:32")
  assert.equal(board.otherSideEmpty, true)
  assert.deepEqual(board.directions[0][0], {
    destination: "往柴灣",
    trains: [
      { wait: "即將到站", clock: "10:32", platform: "3" },
      { wait: "4 分鐘", clock: "10:36", platform: "3" },
    ],
  })
})

test("keeps a verified opposite direction at a through station", () => {
  const board = parseSchedule(
    {
      status: 1,
      isdelay: "Y",
      data: {
        "ISL-CEN": {
          UP: [{ seq: "1", dest: "CHW", plat: "2", time: "2026-11-21 10:40:00", ttnt: "2", valid: "Y" }],
          DOWN: [{ seq: "1", dest: "KET", plat: "1", time: "2026-11-21 10:41:00", ttnt: "3", valid: "Y" }],
        },
      },
    },
    "ISL",
    "CEN",
    names,
    false,
    now,
  )
  assert.equal(board.state, "board")
  if (board.state !== "board") return
  assert.equal(board.delayed, true)
  assert.equal(board.otherSideEmpty, false)
  assert.equal(board.directions.length, 2)
})

test("describes an empty station, a suspension, and special service", () => {
  const empty = parseSchedule(
    { status: 1, isdelay: "N", data: { "EAL-RAC": { UP: [], DOWN: [] } } },
    "EAL",
    "RAC",
    names,
    true,
    now,
  )
  assert.equal(empty.state, "empty")

  const terminus = parseSchedule(
    {
      status: 1,
      data: {
        "TWL-CEN": {
          UP: [],
          DOWN: [{ seq: "1", dest: "TSW", plat: "2", time: "2026-11-21 10:40:00", ttnt: "5", valid: "Y" }],
        },
      },
    },
    "TWL",
    "CEN",
    { TSW: "荃灣" },
    true,
    now,
  )
  assert.equal(terminus.state, "board")
  if (terminus.state === "board") assert.equal(terminus.otherSideEmpty, false)

  const suspended = parseSchedule(
    { status: 0, message: "LOW station is suspended" },
    "EAL",
    "LOW",
    names,
    true,
    now,
  )
  assert.equal(suspended.state, "error")
  if (suspended.state === "error") assert.equal(suspended.title, "此站暫時暫停服務。")

  const special = parseSchedule(
    {
      status: 0,
      message: "Special train service arrangements are now in place on this line.",
      url: "https://www.mtr.com.hk/alert/alert_title_wap.html",
    },
    "TKL",
    "TKO",
    names,
    false,
    now,
  )
  assert.equal(special.state, "error")
  if (special.state === "error") {
    assert.match(special.title, /特別班次/)
    assert.equal(special.href, "https://www.mtr.com.hk/alert/alert_title_wap.html")
  }
})

test("rejects an untrusted link and an unknown failure", () => {
  const untrusted = parseSchedule(
    { status: 0, message: "Special train service", url: "https://example.com/alert" },
    "TKL",
    "TKO",
    names,
    false,
    now,
  )
  assert.equal(untrusted.state, "error")
  if (untrusted.state === "error") assert.equal(untrusted.href, undefined)

  const unknown = parseSchedule(
    { status: 0, message: "The contents are empty!" },
    "ISL",
    "ZZZ",
    names,
    false,
    now,
  )
  assert.equal(unknown.state, "error")
  if (unknown.state === "error") assert.equal(unknown.title, "暫時取不到到站資料。")
})

test("formats an older timestamp and recognises the service image", () => {
  assert.equal(formatUpdated("2026-11-20 23:10:00", now), "11月20日 23:10")
  assert.equal(isServicePlaceholder(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), true)
  assert.equal(isServicePlaceholder(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), false)
})
