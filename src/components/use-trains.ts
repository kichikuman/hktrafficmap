"use client"

import { useEffect, useState } from "react"
import { fetchArrivals } from "@/lib/train-feed"
import { placeTrains, type PlacedTrain } from "@/lib/trains"

const REFRESH_MS = 90_000

export type TrainStatus = "off" | "loading" | "ready" | "stale"

export function useTrains(enabled: boolean): { trains: PlacedTrain[]; status: TrainStatus } {
  const [trains, setTrains] = useState<PlacedTrain[]>([])
  const [status, setStatus] = useState<TrainStatus>("off")

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let running = false
    let fetchedAt = 0
    let refreshMs = REFRESH_MS
    let snapshot: PlacedTrain[] = []
    const controller = new AbortController()

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
        setTrains(snapshot)
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
      if (fetchedAt === 0 || Date.now() - fetchedAt >= refreshMs) void run()
    }, 5000)
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

  return { trains: enabled ? trains : [], status: enabled ? status : "off" }
}
