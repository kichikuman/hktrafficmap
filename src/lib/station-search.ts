import type { Station } from "@/lib/types"

const RESULT_LIMIT = 8

export function normalizeStationQuery(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/荔/g, "茘")
    .replace(/線/g, "綫")
    .replace(/臺/g, "台")
    .replace(/[\s\-_'"’.·]/g, "")
}

function matchScore(query: string, name: string): number | null {
  if (!query || !name) return null
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  if (name.includes(query)) return 2
  return null
}

export function searchStations(stations: Station[], query: string, limit = RESULT_LIMIT): Station[] {
  const normalized = normalizeStationQuery(query)
  if (!normalized) return []

  const ranked = stations.flatMap((station) => {
    const chinese = matchScore(normalized, normalizeStationQuery(station.nameZh))
    const english = matchScore(normalized, normalizeStationQuery(station.nameEn))
    const scores = [chinese, english].filter((score): score is number => score !== null)
    if (scores.length === 0) return []
    return [{ station, score: Math.min(...scores) }]
  })

  ranked.sort(
    (left, right) =>
      left.score - right.score || left.station.nameZh.localeCompare(right.station.nameZh, "zh-Hant-HK"),
  )
  return ranked.slice(0, limit).map((item) => item.station)
}
