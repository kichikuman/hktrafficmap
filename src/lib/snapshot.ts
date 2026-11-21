export type SnapshotResult =
  | { kind: "photo" | "unavailable"; objectUrl: string }
  | { kind: "error" }

export function isServicePlaceholder(bytes: Uint8Array): boolean {
  return bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46
}

export async function loadSnapshot(url: string, signal: AbortSignal): Promise<SnapshotResult | null> {
  try {
    const stamp = Math.floor(Date.now() / 120_000)
    const separator = url.includes("?") ? "&" : "?"
    const response = await fetch(`${url}${separator}t=${stamp}`, { signal })
    if (!response.ok) return { kind: "error" }
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const placeholder = isServicePlaceholder(bytes)
    const blob = new Blob([buffer], { type: placeholder ? "image/gif" : "image/jpeg" })
    return {
      kind: placeholder ? "unavailable" : "photo",
      objectUrl: URL.createObjectURL(blob),
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return null
    return { kind: "error" }
  }
}
