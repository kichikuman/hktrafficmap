import camerasJson from "@/data/cameras.json"
import networkJson from "@/data/network.json"
import type { Camera, Network } from "@/lib/types"

export const network = networkJson as Network
export const cameras = camerasJson as Camera[]

export const stationByCode = new Map(network.stations.map((station) => [station.code, station]))
export const cameraByKey = new Map(cameras.map((camera) => [camera.key, camera]))
export const lineByCode = new Map(network.lines.map((line) => [line.code, line]))
export const stationNames = Object.fromEntries(
  network.stations.map((station) => [station.code, station.nameZh]),
)

export const lineGeoJson = {
  type: "FeatureCollection" as const,
  features: network.lines.map((line) => ({
    type: "Feature" as const,
    properties: {
      code: line.code,
      nameZh: line.nameZh,
      color: line.color,
    },
    geometry: {
      type: "MultiLineString" as const,
      coordinates: line.coordinates,
    },
  })),
}

export const stationGeoJson = {
  type: "FeatureCollection" as const,
  features: network.stations.map((station) => ({
    type: "Feature" as const,
    properties: {
      code: station.code,
      nameZh: station.nameZh,
      interchange: station.lines.length > 1 ? 1 : 0,
    },
    geometry: {
      type: "Point" as const,
      coordinates: [station.lon, station.lat],
    },
  })),
}

export const cameraGeoJson = {
  type: "FeatureCollection" as const,
  features: cameras.map((camera) => ({
    type: "Feature" as const,
    properties: {
      key: camera.key,
      description: camera.description,
    },
    geometry: {
      type: "Point" as const,
      coordinates: [camera.lon, camera.lat],
    },
  })),
}
