export type Station = {
  code: string
  nameZh: string
  nameEn: string
  lon: number
  lat: number
  lines: string[]
  terminusLines: string[]
}

export type TransitLine = {
  code: string
  nameZh: string
  color: string
  coordinates: number[][][]
}

export type Network = {
  stations: Station[]
  lines: TransitLine[]
}

export type Camera = {
  key: string
  region: string
  district: string
  description: string
  lon: number
  lat: number
  url: string
}

export type Selection =
  | { type: "station"; code: string }
  | { type: "camera"; key: string }
