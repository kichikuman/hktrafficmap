const url = process.env.NEXT_PUBLIC_TRAIN_CACHE_URL?.trim() ?? ""
if (!url.startsWith("https://")) {
  console.error("Production build requires NEXT_PUBLIC_TRAIN_CACHE_URL to be an https address.")
  process.exit(1)
}
