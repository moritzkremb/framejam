/** Draws a comment pin (lime dot, dark ring) at a normalized point, so a frame image shows where the user pointed. */
export function drawPin(canvas: HTMLCanvasElement, x: number, y: number) {
  const g = canvas.getContext("2d")!;
  const r = Math.max(9, canvas.width / 45);
  g.beginPath();
  g.arc(x * canvas.width, y * canvas.height, r, 0, Math.PI * 2);
  g.fillStyle = "#d4ff3a";
  g.fill();
  g.lineWidth = Math.max(2, r / 4);
  g.strokeStyle = "#111";
  g.stroke();
}
