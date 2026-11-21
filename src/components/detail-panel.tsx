"use client"

import { useEffect, useState } from "react"
import { RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { lineByCode, stationNames } from "@/lib/geo"
import { inkOn, type ParsedSchedule } from "@/lib/schedule"
import { fetchStationSchedule } from "@/lib/train-feed"
import { loadSnapshot, type SnapshotResult } from "@/lib/snapshot"
import type { Camera, Station } from "@/lib/types"

type DetailPanelProps = {
  station?: Station
  camera?: Camera
  refreshToken: number
  onClose: () => void
  onRefresh: () => void
}

export function DetailPanel({ station, camera, refreshToken, onClose, onRefresh }: DetailPanelProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const title = station?.nameZh ?? camera?.description ?? ""

  return (
    <aside
      role="dialog"
      aria-label={title}
      className="absolute inset-x-3 bottom-3 z-20 flex max-h-[min(72dvh,680px)] flex-col overflow-hidden rounded-2xl border bg-background/96 shadow-2xl backdrop-blur-md md:inset-x-auto md:top-28 md:right-3 md:bottom-4 md:w-[390px] md:max-h-none"
    >
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h2 tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">
            {station ? station.nameZh : camera?.description}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {station
              ? station.nameEn
              : camera
                ? `${camera.region} · ${camera.district}`
                : ""}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="關閉" onClick={onClose}>
          <X />
        </Button>
      </div>
      <Separator />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {station ? (
            <StationBoard key={`${station.code}-${refreshToken}`} station={station} />
          ) : null}
          {camera ? (
            <CameraBoard key={`${camera.key}-${refreshToken}`} camera={camera} />
          ) : null}
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-xs leading-5 text-muted-foreground">
          {station
            ? "到站班次來自港鐵。按重新整理取得最新已快取的資料。"
            : "照片約每兩分鐘更新。"}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw />
          重新整理
        </Button>
      </div>
    </aside>
  )
}

function StationBoard({ station }: { station: Station }) {
  const [results, setResults] = useState<Record<string, ParsedSchedule | "loading">>(() =>
    Object.fromEntries(station.lines.map((line) => [line, "loading"])),
  )

  useEffect(() => {
    const controller = new AbortController()
    for (const line of station.lines) {
      fetchStationSchedule(
        line,
        station.code,
        stationNames,
        station.terminusLines.includes(line),
        controller.signal,
      ).then((result) => {
        if (!result) return
        setResults((current) => ({ ...current, [line]: result }))
      })
    }
    return () => controller.abort()
  }, [station])

  return (
    <div className="space-y-4" aria-live="polite">
      {station.lines.map((code) => {
        const line = lineByCode.get(code)
        const result = results[code]
        if (!line) return null
        return (
          <section key={code} className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: line.color, color: inkOn(line.color) }}
              >
                {line.nameZh}
              </span>
              {result !== "loading" && result.state !== "error" && result.delayed ? (
                <span className="text-xs font-medium text-amber-700">此綫現有延誤</span>
              ) : null}
            </div>
            {result === "loading" ? <p className="text-sm text-muted-foreground">正在查看到站班次…</p> : null}
            {result !== "loading" ? <ScheduleBody result={result} /> : null}
          </section>
        )
      })}
    </div>
  )
}

function ScheduleBody({ result }: { result: ParsedSchedule }) {
  if (result.state === "error") {
    return (
      <div className="rounded-xl bg-muted px-3 py-2 text-sm leading-6">
        <p>{result.title}</p>
        {result.detail ? <p className="text-muted-foreground">{result.detail}</p> : null}
        {result.href ? (
          <a className="font-medium underline underline-offset-4" href={result.href} target="_blank" rel="noreferrer">
            查看港鐵公告
          </a>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {result.updatedAt ? (
        <p className="text-xs text-muted-foreground">資料時間 {result.updatedAt}</p>
      ) : null}
      {result.state === "empty" ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm leading-6">這個車站暫時沒有到站班次。</p>
      ) : (
        <>
          {result.directions.map((direction, directionIndex) => (
            <div key={directionIndex} className="space-y-2">
              {directionIndex > 0 ? <Separator /> : null}
              {direction.map((group, groupIndex) => (
                <div key={`${directionIndex}-${groupIndex}`}>
                  <h3 className="text-sm font-semibold">{group.destination}</h3>
                  <ul className="mt-1 space-y-1">
                    {group.trains.map((train, trainIndex) => (
                      <li key={`${groupIndex}-${trainIndex}`} className="flex flex-wrap gap-x-3 text-sm">
                        <span className="font-medium">{train.wait}</span>
                        {train.platform ? <span className="text-muted-foreground">月台 {train.platform}</span> : null}
                        {train.clock ? <span className="text-muted-foreground">{train.clock}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
          {result.otherSideEmpty ? (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm leading-6">另一方向暫時沒有到站班次。</p>
          ) : null}
        </>
      )}
    </div>
  )
}

function CameraBoard({ camera }: { camera: Camera }) {
  const [result, setResult] = useState<SnapshotResult | "loading">("loading")
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    loadSnapshot(camera.url, controller.signal).then((snapshot) => {
      if (snapshot) setResult(snapshot)
    })
    return () => {
      controller.abort()
    }
  }, [camera])

  useEffect(() => {
    if (result === "loading" || result.kind === "error") return
    const objectUrl = result.objectUrl
    return () => URL.revokeObjectURL(objectUrl)
  }, [result])

  if (result === "loading") {
    return (
      <div className="grid h-48 place-items-center rounded-xl bg-muted text-sm text-muted-foreground">
        正在取得最新照片…
      </div>
    )
  }

  if (result.kind === "error" || imageFailed) {
    return (
      <p className="rounded-xl bg-muted px-3 py-3 text-sm leading-6">暫時未能取得這張快拍照片。</p>
    )
  }

  if (result.kind === "unavailable") {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-950">
          運輸署暫時未能提供這個快拍點的路面照片。
        </p>
        {/* The department returns a notice image instead of a road photo. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.objectUrl}
          alt="暫時未能提供服務"
          className="w-full rounded-xl border bg-amber-100"
          onError={() => setImageFailed(true)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Snapshot JPEGs are already 320×240 and come from another site. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={result.objectUrl}
        alt={`${camera.description}的最新交通快拍`}
        className="w-full rounded-xl border bg-muted"
        onError={() => setImageFailed(true)}
      />
      <p className="text-xs text-muted-foreground">編號 {camera.key}</p>
    </div>
  )
}
