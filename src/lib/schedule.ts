export type RawTrain = {
  seq?: string
  dest?: string
  plat?: string
  time?: string
  ttnt?: string
  valid?: string
}

type RawBlock = {
  UP?: RawTrain[]
  DOWN?: RawTrain[]
  sys_time?: string
  curr_time?: string
}

type RawSchedule = {
  status?: number | string
  message?: string
  url?: string
  isdelay?: string | null
  sys_time?: string
  data?: Record<string, RawBlock>
}

export type TrainCard = {
  wait: string
  clock: string | null
  platform: string | null
}

export type DestinationGroup = {
  destination: string
  trains: TrainCard[]
}

export type ScheduleBoard = {
  state: "board"
  delayed: boolean
  updatedAt: string | null
  directions: DestinationGroup[][]
  otherSideEmpty: boolean
}

export type ScheduleEmpty = {
  state: "empty"
  delayed: boolean
  updatedAt: string | null
}

export type ScheduleError = {
  state: "error"
  title: string
  detail?: string
  href?: string
}

export type ParsedSchedule = ScheduleBoard | ScheduleEmpty | ScheduleError

export function formatWait(ttnt: string | undefined): string {
  const value = ttnt?.trim() ?? ""
  if (value === "0") return "即將到站"
  if (/^\d+$/.test(value)) return `${Number(value)} 分鐘`
  return "時間未明"
}

export function formatClock(time: string | undefined): string | null {
  const match = time?.match(/(\d{2}:\d{2})(?::\d{2})?$/)
  return match?.[1] ?? null
}

export function formatUpdated(sysTime: string | undefined, now = new Date()): string | null {
  if (!sysTime || sysTime === "-") return null
  const match = sysTime.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/)
  if (!match) return null
  const day = `${match[1]}-${match[2]}-${match[3]}`
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(now)
  if (day === today) return match[4]
  return `${Number(match[2])}月${Number(match[3])}日 ${match[4]}`
}

export function inkOn(hex: string): string {
  const value = hex.replace("#", "")
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000
  return luminance > 155 ? "#1c1917" : "#ffffff"
}

export function explainFailure(message: string | undefined, url?: string): ScheduleError {
  const text = (message ?? "").toLowerCase()
  const href = url?.startsWith("https://www.mtr.com.hk/") ? url : undefined
  if (text.includes("special train")) {
    return {
      state: "error",
      title: "這條綫現正實施特別班次安排。",
      detail: href ? "詳細安排見港鐵公告。" : "請稍後再試，或到港鐵車站公告查看。",
      href,
    }
  }
  if (text.includes("suspended")) {
    return { state: "error", title: "此站暫時暫停服務。" }
  }
  return { state: "error", title: "暫時取不到到站資料。" }
}

function usable(trains: RawTrain[] | undefined): RawTrain[] {
  if (!Array.isArray(trains)) return []
  return trains
    .filter((train) => {
      const flag = train.valid?.trim().toUpperCase()
      return flag == null || flag === "" || flag === "Y"
    })
    .sort((a, b) => Number(a.seq ?? 0) - Number(b.seq ?? 0))
}

function group(trains: RawTrain[], names: Record<string, string>): DestinationGroup[] {
  const groups: DestinationGroup[] = []
  for (const train of trains) {
    const destination = names[train.dest ?? ""] ? `往${names[train.dest ?? ""]}` : "目的地未明"
    const card: TrainCard = {
      wait: formatWait(train.ttnt),
      clock: formatClock(train.time),
      platform: train.plat && train.plat !== "-" ? train.plat : null,
    }
    const last = groups.at(-1)
    if (last?.destination === destination) last.trains.push(card)
    else groups.push({ destination, trains: [card] })
  }
  return groups
}

export function parseSchedule(
  payload: unknown,
  line: string,
  station: string,
  names: Record<string, string>,
  isTerminus: boolean,
  now = new Date(),
): ParsedSchedule {
  if (!payload || typeof payload !== "object") {
    return { state: "error", title: "暫時取不到到站資料。" }
  }
  const body = payload as RawSchedule
  if (Number(body.status) !== 1) return explainFailure(body.message, body.url)

  const block = body.data?.[`${line}-${station}`] ?? {}
  const up = usable(block.UP)
  const down = usable(block.DOWN)
  const delayed = (body.isdelay ?? "").toUpperCase() === "Y"
  const stamp = block.sys_time && block.sys_time !== "-" ? block.sys_time : body.sys_time
  const updatedAt = formatUpdated(stamp, now)
  if (up.length === 0 && down.length === 0) return { state: "empty", delayed, updatedAt }

  const oneSideEmpty = up.length === 0 || down.length === 0
  return {
    state: "board",
    delayed,
    updatedAt,
    directions: [up, down].filter((side) => side.length > 0).map((side) => group(side, names)),
    otherSideEmpty: !isTerminus && oneSideEmpty,
  }
}

export async function fetchSchedule(
  line: string,
  station: string,
  names: Record<string, string>,
  isTerminus: boolean,
  signal: AbortSignal,
): Promise<ParsedSchedule | null> {
  try {
    const url = new URL("https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php")
    url.searchParams.set("line", line)
    url.searchParams.set("sta", station)
    url.searchParams.set("lang", "TC")
    const response = await fetch(url, { signal })
    if (response.status === 429) {
      return { state: "error", title: "查詢太頻繁，請稍後再按重新整理。" }
    }
    if (!response.ok) return { state: "error", title: "暫時取不到到站資料。" }
    return parseSchedule(await response.json(), line, station, names, isTerminus)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return null
    return { state: "error", title: "暫時取不到到站資料。" }
  }
}
