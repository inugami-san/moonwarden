/** The painted content of object-fit: contain, not the surrounding letterbox. */
export function fittedCanvasBounds(rect: { left: number; top: number; width: number; height: number }, width = 1280, height = 760) {
  const scale = Math.min(rect.width / width, rect.height / height);
  return { left: rect.left + (rect.width - width * scale) / 2, top: rect.top + (rect.height - height * scale) / 2, width: width * scale, height: height * scale };
}
