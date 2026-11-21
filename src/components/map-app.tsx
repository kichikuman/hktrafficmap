"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { DetailPanel } from "@/components/detail-panel"
import { MapCanvas } from "@/components/map-canvas"
import { StationSearch } from "@/components/station-search"
import { cameraByKey, network, stationByCode } from "@/lib/geo"
import type { Selection, Station } from "@/lib/types"

export function MapApp() {
  const [showLines, setShowLines] = useState(true)
  const [showCameras, setShowCameras] = useState(true)
  const [legendOpen, setLegendOpen] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [styleError, setStyleError] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ code: string; nonce: number } | null>(null)
  const lineSwitchId = useId()
  const cameraSwitchId = useId()
  const shellRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  const station = selection?.type === "station" ? stationByCode.get(selection.code) : undefined
  const camera = selection?.type === "camera" ? cameraByKey.get(selection.key) : undefined

  function changeLines(checked: boolean) {
    setShowLines(checked)
    if (!checked && selection?.type === "station") setSelection(null)
  }

  function changeCameras(checked: boolean) {
    setShowCameras(checked)
    if (!checked && selection?.type === "camera") setSelection(null)
  }

  function chooseStation(stationToOpen: Station) {
    setShowLines(true)
    setLegendOpen(false)
    setSelection({ type: "station", code: stationToOpen.code })
    setFocus((current) => ({ code: stationToOpen.code, nonce: (current?.nonce ?? 0) + 1 }))
  }

  useEffect(() => {
    const shell = shellRef.current
    const header = headerRef.current
    if (!shell || !header) return
    const update = () => {
      const top = header.getBoundingClientRect().bottom - shell.getBoundingClientRect().top + 8
      shell.style.setProperty("--map-chrome-top", `${Math.ceil(top)}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(header)
    window.addEventListener("resize", update)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [legendOpen])

  return (
    <main ref={shellRef} className="map-shell relative h-dvh overflow-hidden bg-[#e7e5e4] text-foreground">
      <MapCanvas
        showLines={showLines}
        showCameras={showCameras}
        selection={selection}
        focus={focus}
        onSelect={(next) => {
          setSelection(next)
          if (next) setLegendOpen(false)
        }}
        onStyleError={setStyleError}
      />

      <header
        ref={headerRef}
        className="absolute inset-x-3 top-3 z-20 rounded-2xl border bg-background/95 shadow-lg backdrop-blur-md"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 pt-2.5">
          <div className="min-w-[12rem] flex-1">
            <h1 className="text-base font-semibold tracking-tight">香港智慧城市地圖</h1>
            <p className="text-xs text-muted-foreground">點車站查到站班次，點快拍點看最新照片</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id={lineSwitchId} checked={showLines} onCheckedChange={changeLines} />
            <label htmlFor={lineSwitchId} className="text-sm">
              港鐵
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id={cameraSwitchId} checked={showCameras} onCheckedChange={changeCameras} />
            <label htmlFor={cameraSwitchId} className="text-sm">
              快拍
            </label>
          </div>
          <Button
            type="button"
            variant={legendOpen ? "secondary" : "outline"}
            size="sm"
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen((open) => !open)}
          >
            路綫圖例
          </Button>
        </div>
        <div className="px-3 pt-2">
          <StationSearch onSelect={chooseStation} />
        </div>
        {legendOpen ? (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t px-3 py-2.5 sm:grid-cols-5">
            {network.lines.map((line) => (
              <li key={line.code} className="flex items-center gap-2 text-xs">
                <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: line.color }} />
                {line.nameZh}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="border-t px-3 py-1.5 text-[10px] leading-4 text-muted-foreground">
          底圖 OpenFreeMap、OpenMapTiles、OpenStreetMap · 車站位置地政總署 · 班次港鐵 · 快拍運輸署
        </p>
      </header>

      {!showLines && !showCameras ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 px-6 text-center">
          <p className="inline-block rounded-2xl bg-background/95 px-4 py-3 text-sm shadow-lg">
            港鐵網絡和交通快拍都已隱藏。請在上方重新開啟。
          </p>
        </div>
      ) : null}

      {styleError ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-background/80 p-6">
          <div className="max-w-sm rounded-2xl border bg-background p-5 text-center shadow-xl">
            <h2 className="text-lg font-semibold">地圖暫時未能顯示</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{styleError}</p>
            <Button type="button" className="mt-4" onClick={() => window.location.reload()}>
              重新載入
            </Button>
          </div>
        </div>
      ) : null}

      {station || camera ? (
        <DetailPanel
          station={station}
          camera={camera}
          refreshToken={refreshToken}
          onClose={() => setSelection(null)}
          onRefresh={() => setRefreshToken((token) => token + 1)}
        />
      ) : null}
    </main>
  )
}
