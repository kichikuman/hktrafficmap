const WEBGL_MESSAGE = "這個瀏覽器未能開啟地圖繪圖。請改用已開啟圖像加速的 Chrome、Edge 或 Firefox。"
const WORKER_MESSAGE = "地圖元件未能載入。請先安裝依賴後再重新開啟。"
const BASEMAP_MESSAGE = "底圖暫時未能載入。請檢查網絡後再重新開啟。"

export function mapFailureMessage(message: string): string | null {
  if (/webgl/i.test(message)) return WEBGL_MESSAGE
  if (/worker/i.test(message)) return WORKER_MESSAGE
  if (/failed to load style|unable to load style/i.test(message)) return BASEMAP_MESSAGE
  return null
}
