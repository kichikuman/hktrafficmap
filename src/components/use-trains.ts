"use client"

import { useEffect, useState } from "react"
import { lineByCode, stationNames } from "@/lib/geo"
import { fetchArrivals } from "@/lib/train-feed"
import { placeTrains, trainCollection, type PlacedTrain, type TrainFeatureCollection } from "@/lib/trains"

const REFRESH_MS = 90_000

export type TrainStatus = "off" | "loading" | "ready" | "stale"

const empty: TrainFeatureCollection = { type: "FeatureCollection", features: [] }

const colors = Object.fromEntries([...lineByCode.values()].map((line) => [line.code, line.color]))

export function useTrains(enabled: boolean): { trains: TrainFeatureCollection; status: TrainStatus } {
  const [trains, setTrains] = useState<TrainFeatureCollection>(empty)
  const [status, setStatus] = useState<TrainStatus>("off")

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let running = false
    let fetchedAt = 0
    let refreshMs = REFRESH_MS
    let snapshot: PlacedTrain[] = []
    const controller = new AbortController()

    const publish = (now: number) => {
      setTrains(trainCollection(snapshot, now, stationNames, colors))
    }

    const run = async () => {
      if (running || cancelled || document.visibilityState === "hidden") return
      running = true
      if (snapshot.length === 0) setStatus("loading")
      try {
        const result = await fetchArrivals(controller.signal)
        if (cancelled) return
        const now = Date.now()
        snapshot = placeTrains(result.arrivals, now)
        fetchedAt = now
        refreshMs = result.limited || result.ok === 0 ? 20_000 : REFRESH_MS
        publish(now)
        setStatus(result.limited || result.ok === 0 ? "stale" : "ready")
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return
        fetchedAt = Date.now()
        refreshMs = 20_000
        setStatus("stale")
      } finally {
        running = false
      }
    }

    void run()
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return
      const now = Date.now()
      if (fetchedAt === 0 || now - fetchedAt >= refreshMs) void run()
      else publish(now)
    }, 1000)
    const onVisible = () => {
      if (document.visibilityState === "visible" && (fetchedAt === 0 || Date.now() - fetchedAt >= refreshMs)) {
        void run()
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [enabled])

  return { trains: enabled ? trains : empty, status: enabled ? status : "off" }
}
