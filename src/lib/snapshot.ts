export type SnapshotResult =
  | { kind: "photo" | "unavailable"; objectUrl: string }
  | { kind: "error" }

export type SnapshotKind = "photo" | "unavailable" | "invalid"

const SERVICE_PLACEHOLDER_SHA256 =
  "b98b44d56b4e09b74da311bcebc79c63f46b441cd8d0c96d8e94a876d7d1c416"

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes)
  const digest = await crypto.subtle.digest("SHA-256", copy)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")
}

export async function classifySnapshot(bytes: Uint8Array): Promise<SnapshotKind> {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "photo"
  if (!startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return "invalid"
  return (await sha256(bytes)) === SERVICE_PLACEHOLDER_SHA256 ? "unavailable" : "invalid"
}

export async function loadSnapshot(url: string, signal: AbortSignal): Promise<SnapshotResult | null> {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" || parsed.hostname !== "tdcctv.data.one.gov.hk") {
      return { kind: "error" }
    }
    parsed.searchParams.set("t", String(Math.floor(Date.now() / 120_000)))
    const response = await fetch(parsed, { signal })
    if (!response.ok) return { kind: "error" }
    const bytes = new Uint8Array(await response.arrayBuffer())
    const kind = await classifySnapshot(bytes)
    if (kind === "invalid") return { kind: "error" }
    const blob = new Blob([bytes], { type: kind === "unavailable" ? "image/gif" : "image/jpeg" })
    return { kind, objectUrl: URL.createObjectURL(blob) }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return null
    return { kind: "error" }
  }
}
