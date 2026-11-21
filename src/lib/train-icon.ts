const MATERIAL_TRAIN =
  "M4 15.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V5c0-3.5-3.58-4-8-4s-8 .5-8 4v10.5zm8 1.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-7H6V5h12v5z"

export function drawTrain(color: string): ImageData {
  const ratio = 2
  const size = 32
  const canvas = document.createElement("canvas")
  canvas.width = size * ratio
  canvas.height = size * ratio
  const context = canvas.getContext("2d")
  if (!context) return new ImageData(canvas.width, canvas.height)
  context.scale(ratio, ratio)
  context.translate(4, 4)
  const train = new Path2D(MATERIAL_TRAIN)
  context.lineJoin = "round"
  context.lineWidth = 1.6
  context.strokeStyle = "#ffffff"
  context.stroke(train)
  context.fillStyle = color
  context.fill(train, "evenodd")
  context.fillStyle = "#f8fafc"
  context.fillRect(6, 5, 12, 5)
  context.beginPath()
  context.arc(12, 14.5, 1.7, 0, Math.PI * 2)
  context.fill()
  return context.getImageData(0, 0, canvas.width, canvas.height)
}
