import trainRoutes from "../data/train-routes.json" with { type: "json" }

export type TrainFeatureCollection = {
  type: "FeatureCollection"
  features: {
    type: "Feature"
    properties: { id: string; color: string; bearing: number; title: string; detail: string }
    geometry: { type: "Point"; coordinates: number[] }
  }[]
}

type Segment = {
  from: string
  to: string
  minutes: number
  coordinates: number[][]
}

type LineRoutes = {
  routes: string[][]
  segments: Segment[]
  samples: string[]
}

type RouteFile = {
  sampleCount: number
  lines: Record<string, LineRoutes>
}

const routes = trainRoutes as RouteFile

export type Arrival = {
  line: string
  station: string
  dest: string
  ttnt: number
  eta: string
  viaRacecourse: boolean
}

export type PlacedTrain = {
  id: string
  line: string
  dest: string
  toward: string
  coordinates: number[][]
  segmentMinutes: number
  remainingAtFetch: number
  fetchedAt: number
}

export const trainSamples = Object.entries(routes.lines).flatMap(([line, value]) =>
  value.samples.map((station) => ({ line, station })),
)

const segmentByLine = new Map<string, Map<string, Segment>>()
for (const [line, value] of Object.entries(routes.lines)) {
  const lookup = new Map<string, Segment>()
  for (const segment of value.segments) lookup.set(`${segment.from}|${segment.to}`, segment)
  segmentByLine.set(line, lookup)
}

function segment(line: string, start: string, end: string): Segment | null {
  const found = segmentByLine.get(line)?.get(`${start}|${end}`)
  if (found) return found
  const reverse = segmentByLine.get(line)?.get(`${end}|${start}`)
  if (!reverse) return null
  return {
    from: start,
    to: end,
    minutes: reverse.minutes,
    coordinates: [...reverse.coordinates].reverse(),
  }
}

function pickRoute(line: string, station: string, dest: string, viaRacecourse: boolean): string[] | null {
  const candidates = (routes.lines[line]?.routes ?? []).filter(
    (route) => route.includes(station) && route.includes(dest),
  )
  if (candidates.length === 0) return null
  if (viaRacecourse) return candidates.find((route) => route.includes("RAC")) ?? candidates[0]
  return candidates.find((route) => !route.includes("RAC")) ?? candidates[0]
}

function degrees(start: number[], end: number[]): number {
  const y = Math.sin(radians(end[0] - start[0])) * Math.cos(radians(end[1]))
  const x =
    Math.cos(radians(start[1])) * Math.sin(radians(end[1])) -
    Math.sin(radians(start[1])) * Math.cos(radians(end[1])) * Math.cos(radians(end[0] - start[0]))
  return (Math.atan2(y, x) * 180) / Math.PI
}

function radians(value: number): number {
  return (value * Math.PI) / 180
}

export function pointAlong(coordinates: number[][], fraction: number): { point: number[]; bearing: number } {
  const lengths: number[] = []
  let total = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1]
    const end = coordinates[index]
    const length = Math.hypot(end[0] - start[0], end[1] - start[1])
    lengths.push(length)
    total += length
  }
  const target = Math.max(0, Math.min(1, fraction)) * total
  let walked = 0
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]
    const start = coordinates[index]
    const end = coordinates[index + 1]
    if (walked + length >= target || index === lengths.length - 1) {
      const ratio = length === 0 ? 0 : (target - walked) / length
      return {
        point: [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio],
        bearing: (degrees(start, end) + 360) % 360,
      }
    }
    walked += length
  }
  const last = coordinates[coordinates.length - 1]
  return { point: last, bearing: 0 }
}

function shiftRight(point: number[], bearing: number, metres: number): number[] {
  const side = radians(bearing + 90)
  const east = (metres * Math.sin(side)) / (111_320 * Math.cos(radians(point[1])))
  const north = (metres * Math.cos(side)) / 110_540
  return [point[0] + east, point[1] + north]
}

function onSegment(
  arrival: Arrival,
  upstream: string,
  downstream: string,
  remaining: number,
  fetchedAt: number,
): PlacedTrain | null {
  const found = segment(arrival.line, upstream, downstream)
  if (!found) return null
  return {
    id: `${arrival.line}|${arrival.dest}|${arrival.eta}|${arrival.station}`,
    line: arrival.line,
    dest: arrival.dest,
    toward: downstream,
    coordinates: found.coordinates,
    segmentMinutes: found.minutes,
    remainingAtFetch: Math.max(0, Math.min(found.minutes, remaining)),
    fetchedAt,
  }
}

export function placeTrain(arrival: Arrival, fetchedAt: number): PlacedTrain | null {
  const route = pickRoute(arrival.line, arrival.station, arrival.dest, arrival.viaRacecourse)
  if (!route) return null
  const here = route.indexOf(arrival.station)
  const destIndex = route.indexOf(arrival.dest)
  if (here < 0 || destIndex < 0) return null
  if (here === destIndex) {
    const neighbor = here === 0 ? 1 : here - 1
    if (neighbor < 0 || neighbor >= route.length) return null
    return onSegment(arrival, route[neighbor], route[here], 0, fetchedAt)
  }
  const step = destIndex > here ? -1 : 1
  let index = here
  let remaining = arrival.ttnt
  while (true) {
    const behind = index + step
    if (behind < 0 || behind >= route.length) {
      const holdFrom = index - step
      if (holdFrom < 0 || holdFrom >= route.length) return null
      return onSegment(arrival, route[holdFrom], route[index], 0, fetchedAt)
    }
    const found = segment(arrival.line, route[behind], route[index])
    if (!found) return null
    if (remaining <= found.minutes) return onSegment(arrival, route[behind], route[index], remaining, fetchedAt)
    remaining -= found.minutes
    index = behind
  }
}

function kilometres(start: number[], end: number[]): number {
  const phi1 = radians(start[1])
  const phi2 = radians(end[1])
  const dphi = radians(end[1] - start[1])
  const dlon = radians(end[0] - start[0])
  const height = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(height))
}

export function placeTrains(arrivals: Arrival[], fetchedAt: number): PlacedTrain[] {
  const placed = arrivals
    .map((arrival) => placeTrain(arrival, fetchedAt))
    .filter((train): train is PlacedTrain => train !== null)
    .sort((a, b) => a.remainingAtFetch - b.remainingAtFetch)
  const kept: PlacedTrain[] = []
  for (const train of placed) {
    const here = trainAt(train, fetchedAt).point
    const duplicate = kept.some((other) => {
      if (other.line !== train.line || other.dest !== train.dest) return false
      return kilometres(here, trainAt(other, fetchedAt).point) < 0.5
    })
    if (!duplicate) kept.push(train)
  }
  return kept
}

export function trainAt(train: PlacedTrain, now: number): { point: number[]; bearing: number; minutes: number } {
  const elapsed = (now - train.fetchedAt) / 60_000
  const remaining = Math.max(0, train.remainingAtFetch - elapsed)
  const fraction = 1 - remaining / train.segmentMinutes
  const { point, bearing } = pointAlong(train.coordinates, fraction)
  return { point: shiftRight(point, bearing, 8), bearing, minutes: remaining }
}

export function trainCollection(
  trains: PlacedTrain[],
  now: number,
  names: Record<string, string>,
  colors: Record<string, string>,
): TrainFeatureCollection {
  return {
    type: "FeatureCollection",
    features: trains.map((train) => {
      const position = trainAt(train, now)
      const shown = position.minutes <= 0 ? 0 : Math.max(1, Math.round(position.minutes))
      const station = names[train.toward] ?? train.toward
      const destination = names[train.dest] ?? train.dest
      return {
        type: "Feature",
        properties: {
          id: train.id,
          color: colors[train.line] ?? "#1c1917",
          bearing: position.bearing,
          title: `往${destination}`,
          detail: shown === 0 ? `即將到${station}` : `${shown} 分鐘後到${station}`,
        },
        geometry: { type: "Point", coordinates: position.point },
      }
    }),
  }
}

export function readArrivals(payload: unknown, line: string, station: string): Arrival[] {
  if (!payload || typeof payload !== "object") return []
  const body = payload as {
    status?: number | string
    data?: Record<string, { UP?: RawTrain[]; DOWN?: RawTrain[] }>
  }
  if (Number(body.status) !== 1) return []
  const block = body.data?.[`${line}-${station}`]
  if (!block) return []
  const arrivals: Arrival[] = []
  for (const train of [...(block.UP ?? []), ...(block.DOWN ?? [])]) {
    if (train.valid && train.valid !== "Y") continue
    const ttnt = Number(train.ttnt)
    if (!Number.isFinite(ttnt) || ttnt < 0 || !train.dest) continue
    arrivals.push({
      line,
      station,
      dest: train.dest,
      ttnt,
      eta: train.time ?? "",
      viaRacecourse: train.route === "RAC",
    })
  }
  return arrivals
}

type RawTrain = { dest?: string; ttnt?: string; valid?: string; time?: string; route?: string }
