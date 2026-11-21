"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { DetailPanel } from "@/components/detail-panel"
import { MapCanvas } from "@/components/map-canvas"
import { StationSearch } from "@/components/station-search"
import { useTrains } from "@/components/use-trains"
import { cameraByKey, network, stationByCode } from "@/lib/geo"
import type { Selection, Station } from "@/lib/types"

export function MapApp() {
  const [showLines, setShowLines] = useState(true)
  const [showCameras, setShowCameras] = useState(false)
  const [showTrains, setShowTrains] = useState(true)
  const [legendOpen, setLegendOpen] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [styleError, setStyleError] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ code: string; nonce: number } | null>(null)
  const lineSwitchId = useId()
  const cameraSwitchId = useId()
  const trainSwitchId = useId()
  const { trains, status: trainStatus } = useTrains(showTrains)

  const station = selection?.type === "station" ? stationByCode.get(selection.code) : undefined
  const camera = selection?.type === "camera" ? cameraByKey.get(selection.key) : undefined

  function changeLines(checked: boolean) {
    setShowLines(checked)
    if (!checked) {
      setShowTrains(false)
      if (selection?.type === "station") setSelection(null)
    }
  }

  function changeTrains(checked: boolean) {
    setShowTrains(checked)
    if (checked) setShowLines(true)
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

  return (
    <main className="map-shell relative h-dvh overflow-hidden bg-[#e7e5e4] text-foreground">
      <MapCanvas
        showLines={showLines}
        showCameras={showCameras}
        showTrains={showTrains}
        trains={trains}
        selection={selection}
        focus={focus}
        onSelect={(next) => {
          setSelection(next)
          if (next) setLegendOpen(false)
        }}
        onStyleError={setStyleError}
      />

      <h1 className="sr-only">香港智慧城市地圖</h1>
      <div className="pointer-events-none absolute top-3 left-[3.75rem] z-20 flex max-w-[calc(100%-4.5rem)] flex-col-reverse items-start gap-2 min-[40rem]:flex-row">
        <StationSearch onSelect={chooseStation} onActivate={() => setLegendOpen(false)} />
        <div className="pointer-events-auto flex w-max max-w-full flex-col items-start gap-2">
          <div className="flex h-10 items-center gap-2 rounded-full border bg-background/95 px-2.5 shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-1.5">
              <Switch id={lineSwitchId} size="sm" checked={showLines} onCheckedChange={changeLines} />
              <label htmlFor={lineSwitchId} className="text-sm">
                港鐵
              </label>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch id={cameraSwitchId} size="sm" checked={showCameras} onCheckedChange={changeCameras} />
              <label htmlFor={cameraSwitchId} className="text-sm">
                快拍
              </label>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch id={trainSwitchId} size="sm" checked={showTrains} onCheckedChange={changeTrains} />
              <label htmlFor={trainSwitchId} className="text-sm">
                列車
              </label>
            </div>
            <Button
              type="button"
              variant={legendOpen ? "secondary" : "outline"}
              size="xs"
              aria-expanded={legendOpen}
              aria-label="路綫圖例"
              onClick={() => setLegendOpen((open) => !open)}
            >
              圖例
            </Button>
          </div>
          {legendOpen ? (
            <ul className="grid w-[16.5rem] max-w-full grid-cols-2 gap-x-3 gap-y-1.5 rounded-2xl border bg-background/95 p-2.5 shadow-xl backdrop-blur-md">
              {network.lines.map((line) => (
                <li key={line.code} className="flex items-center gap-2 text-xs">
                  <span className="h-1.5 w-5 shrink-0 rounded-full" style={{ backgroundColor: line.color }} />
                  {line.nameZh}
                </li>
              ))}
            </ul>
          ) : null}
          {trainStatus === "loading" || trainStatus === "stale" ? (
            <p className="rounded-full bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-lg">
              {trainStatus === "loading" ? "正在取得列車位置" : "列車位置暫時未能更新"}
            </p>
          ) : null}
        </div>
      </div>

      {!showLines && !showCameras ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 px-6 text-center">
          <p className="inline-block rounded-2xl bg-background/95 px-4 py-3 text-sm shadow-lg">
            港鐵網絡和交通快拍都已隱藏。請在左上方重新開啟。
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
