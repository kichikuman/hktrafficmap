"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { lineByCode, network } from "@/lib/geo"
import { searchStations } from "@/lib/station-search"
import type { Station } from "@/lib/types"

type StationSearchProps = {
  onSelect: (station: Station) => void
  onActivate?: () => void
}

export function StationSearch({ onSelect, onActivate }: StationSearchProps) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const results = searchStations(network.stations, query)
  const showList = open && query.trim().length > 0
  const activeId = showList ? `${listId}-${activeIndex}` : undefined

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  function choose(station: Station) {
    setQuery(`${station.nameZh} ${station.nameEn}`)
    setOpen(false)
    onSelect(station)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && showList) {
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (!showList) {
      if (event.key === "ArrowDown" && query.trim()) setOpen(true)
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => (results.length === 0 ? 0 : (index - 1 + results.length) % results.length))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const station = results[activeIndex]
      if (station) choose(station)
    }
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-auto relative w-[17.5rem] max-w-full"
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        搜尋港鐵站
      </label>
      <div className="flex h-10 items-center gap-2 rounded-full border bg-background/95 pr-1.5 pl-3 shadow-lg backdrop-blur-md">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          id={`${listId}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={activeId}
          placeholder="車站，中文或英文"
          value={query}
          autoComplete="off"
          className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
            setOpen(true)
            onActivate?.()
          }}
          onFocus={() => {
            setOpen(true)
            onActivate?.()
          }}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="清除搜尋"
            onClick={() => {
              setQuery("")
              setOpen(false)
            }}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+0.4rem)] z-30 max-h-64 overflow-y-auto rounded-2xl border bg-background p-1 shadow-xl"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">找不到這個車站</li>
          ) : (
            results.map((station, index) => (
              <li key={station.code} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left ${
                    index === activeIndex ? "bg-muted" : "hover:bg-muted"
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(station)}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{station.nameZh}</span>
                    <span className="block truncate text-xs text-muted-foreground">{station.nameEn}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {station.lines.map((code) => {
                      const line = lineByCode.get(code)
                      if (!line) return null
                      return (
                        <span
                          key={code}
                          className="size-2 rounded-full"
                          style={{ backgroundColor: line.color }}
                          title={line.nameZh}
                        />
                      )
                    })}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
