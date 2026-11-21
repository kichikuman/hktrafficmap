export function drawTrain(color: string): ImageData {
  const ratio = 2
  const width = 32
  const height = 52
  const canvas = document.createElement("canvas")
  canvas.width = width * ratio
  canvas.height = height * ratio
  const context = canvas.getContext("2d")
  if (!context) return new ImageData(canvas.width, canvas.height)
  context.scale(ratio, ratio)
  context.beginPath()
  context.roundRect(5, 1, 22, 50, [11, 11, 5, 5])
  context.fillStyle = "#1c1917"
  context.fill()
  context.beginPath()
  context.roundRect(7, 3, 18, 46, [9, 9, 4, 4])
  context.fillStyle = color
  context.fill()
  context.fillStyle = "#f8fafc"
  context.beginPath()
  context.roundRect(11, 7, 10, 6, 2)
  context.fill()
  for (const top of [18, 27, 36]) {
    context.beginPath()
    context.roundRect(10, top, 12, 5, 1.5)
    context.fill()
  }
  return context.getImageData(0, 0, canvas.width, canvas.height)
}
