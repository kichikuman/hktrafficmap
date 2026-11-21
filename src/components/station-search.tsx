"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { Input } from "@/components/ui/input"
import { lineByCode, network } from "@/lib/geo"
import { searchStations } from "@/lib/station-search"
import type { Station } from "@/lib/types"

type StationSearchProps = {
  onSelect: (station: Station) => void
}

export function StationSearch({ onSelect }: StationSearchProps) {
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
    <div ref={containerRef} className="relative min-w-[16rem] flex-1">
      <label htmlFor={`${listId}-input`} className="sr-only">
        搜尋港鐵站
      </label>
      <Input
        id={`${listId}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={activeId}
        placeholder="搜尋車站，中文或英文"
        value={query}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value)
          setActiveIndex(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-30 max-h-72 overflow-y-auto rounded-xl border bg-background p-1 shadow-xl"
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
