"use client"

import { useEffect, useRef, useState } from "react"
import type { Map as MaplibreMap } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { cameraGeoJson, lineGeoJson, stationGeoJson } from "@/lib/geo"
import type { Selection } from "@/lib/types"

const MTR_LAYERS = ["line-casing", "line", "stations", "station-label", "station-selected"]
const CAMERA_LAYERS = ["cameras", "camera-selected"]

type MapCanvasProps = {
  showLines: boolean
  showCameras: boolean
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
  onStyleError: (message: string) => void
}

export function MapCanvas({
  showLines,
  showCameras,
  selection,
  onSelect,
  onStyleError,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const onSelectRef = useRef(onSelect)
  const onStyleErrorRef = useRef(onStyleError)
  const showLinesRef = useRef(showLines)
  const showCamerasRef = useRef(showCameras)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    onSelectRef.current = onSelect
    onStyleErrorRef.current = onStyleError
    showLinesRef.current = showLines
    showCamerasRef.current = showCameras
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let map: MaplibreMap | null = null
    let cancelled = false

    ;(async () => {
      try {
      const maplibregl = await import("maplibre-gl")
      if (cancelled) return
      maplibregl.setWorkerUrl("/maplibre-gl-worker.js")
      map = new maplibregl.Map({
        container,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [114.15, 22.36],
        zoom: 10,
        minZoom: 9,
        maxZoom: 18,
        maxBounds: [
          [113.7, 22.08],
          [114.58, 22.64],
        ],
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: { compact: true },
      })
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left")
      mapRef.current = map

      let loaded = false
      map.on("error", (event) => {
        if (loaded) return
        const message = String(event.error?.message ?? "")
        if (/webgl/i.test(message)) {
          onStyleErrorRef.current("這個瀏覽器未能開啟地圖繪圖。請改用已開啟圖像加速的 Chrome、Edge 或 Firefox。")
        } else if (/style/i.test(message)) {
          onStyleErrorRef.current("底圖暫時未能載入。請檢查網絡後再重新開啟。")
        }
      })

      map.on("load", () => {
        if (!map || cancelled) return
        loaded = true
        map.addSource("mtr-lines", { type: "geojson", data: lineGeoJson })
        map.addSource("mtr-stations", { type: "geojson", data: stationGeoJson })
        map.addSource("cameras", { type: "geojson", data: cameraGeoJson })

        const lineVisibility = showLinesRef.current ? "visible" : "none"
        const cameraVisibility = showCamerasRef.current ? "visible" : "none"

        map.addLayer({
          id: "line-casing",
          type: "line",
          source: "mtr-lines",
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: lineVisibility,
          },
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 4.5, 12, 7.5, 15, 11],
            "line-opacity": 0.95,
          },
        })
        map.addLayer({
          id: "line",
          type: "line",
          source: "mtr-lines",
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: lineVisibility,
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.2, 12, 4.2, 15, 6.5],
          },
        })
        map.addLayer({
          id: "cameras",
          type: "circle",
          source: "cameras",
          layout: { visibility: cameraVisibility },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 12, 4.2, 15, 6],
            "circle-color": "#c2410c",
            "circle-opacity": 0.88,
            "circle-stroke-color": "#fff7ed",
            "circle-stroke-width": 1,
          },
        })
        map.addLayer({
          id: "camera-selected",
          type: "circle",
          source: "cameras",
          filter: ["==", ["get", "key"], ""],
          layout: { visibility: cameraVisibility },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 6, 14, 9],
            "circle-color": "#9a3412",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        })
        map.addLayer({
          id: "stations",
          type: "circle",
          source: "mtr-stations",
          layout: { visibility: lineVisibility },
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              ["case", ["==", ["get", "interchange"], 1], 5.6, 4.4],
              13,
              ["case", ["==", ["get", "interchange"], 1], 8, 6],
              16,
              ["case", ["==", ["get", "interchange"], 1], 10, 7.5],
            ],
            "circle-color": "#ffffff",
            "circle-stroke-color": "#1c1917",
            "circle-stroke-width": ["case", ["==", ["get", "interchange"], 1], 2.4, 1.7],
          },
        })
        map.addLayer({
          id: "station-selected",
          type: "circle",
          source: "mtr-stations",
          filter: ["==", ["get", "code"], ""],
          layout: { visibility: lineVisibility },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 8, 14, 12],
            "circle-color": "#ffffff",
            "circle-stroke-color": "#ea580c",
            "circle-stroke-width": 3,
          },
        })
        map.addLayer({
          id: "station-label",
          type: "symbol",
          source: "mtr-stations",
          minzoom: 12,
          layout: {
            "text-field": ["get", "nameZh"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
            "text-offset": [0, 0.95],
            "text-anchor": "top",
            "text-allow-overlap": false,
            "text-optional": true,
            visibility: lineVisibility,
          },
          paint: {
            "text-color": "#1c1917",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.4,
          },
        })

        const bounds = new maplibregl.LngLatBounds()
        for (const feature of stationGeoJson.features) {
          const [lon, lat] = feature.geometry.coordinates
          bounds.extend([lon, lat])
        }
        map.resize()
        const narrow = window.innerWidth < 768
        map.fitBounds(bounds, {
          padding: narrow
            ? { top: 128, bottom: 64, left: 28, right: 28 }
            : { top: 108, bottom: 48, left: 48, right: 48 },
          maxZoom: 11.2,
          duration: 0,
        })

        map.on("click", (event) => {
          const stations =
            map?.queryRenderedFeatures(event.point, { layers: ["stations", "station-label"] }) ?? []
          const stationCode = stations[0]?.properties?.code
          if (typeof stationCode === "string" && stationCode) {
            onSelectRef.current({ type: "station", code: stationCode })
            return
          }
          const hits = map?.queryRenderedFeatures(event.point, { layers: ["cameras"] }) ?? []
          const key = hits[0]?.properties?.key
          if (typeof key === "string" && key) {
            onSelectRef.current({ type: "camera", key })
            return
          }
          onSelectRef.current(null)
        })

        for (const layer of ["stations", "cameras"]) {
          map.on("mouseenter", layer, () => {
            if (map) map.getCanvas().style.cursor = "pointer"
          })
          map.on("mouseleave", layer, () => {
            if (map) map.getCanvas().style.cursor = ""
          })
        }
        setReady(true)
      })
      } catch (error) {
        const message = error instanceof Error ? error.message : ""
        if (/webgl/i.test(message)) {
          onStyleErrorRef.current("這個瀏覽器未能開啟地圖繪圖。請改用已開啟圖像加速的 Chrome、Edge 或 Firefox。")
        } else {
          onStyleErrorRef.current("底圖暫時未能載入。請檢查網絡後再重新開啟。")
        }
      }
    })()

    return () => {
      cancelled = true
      setReady(false)
      map?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const lineVisibility = showLines ? "visible" : "none"
    const cameraVisibility = showCameras ? "visible" : "none"
    for (const layer of MTR_LAYERS) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", lineVisibility)
    }
    for (const layer of CAMERA_LAYERS) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", cameraVisibility)
    }
  }, [ready, showLines, showCameras])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const stationCode = selection?.type === "station" ? selection.code : ""
    const cameraKey = selection?.type === "camera" ? selection.key : ""
    if (map.getLayer("station-selected")) {
      map.setFilter("station-selected", ["==", ["get", "code"], stationCode])
    }
    if (map.getLayer("camera-selected")) {
      map.setFilter("camera-selected", ["==", ["get", "key"], cameraKey])
    }
  }, [ready, selection])

  return <div ref={containerRef} className="absolute inset-0" />
}
