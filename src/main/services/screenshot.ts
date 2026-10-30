import { desktopCapturer, screen } from 'electron'

/** Claude downsizes anything larger, so capping here saves upload time and latency. */
const MAX_EDGE = 1568

/** Captures the display under the mouse cursor and returns a base64 PNG. */
export async function captureScreen(): Promise<string> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { width, height } = display.size
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const thumbnailSize = { width: Math.round(width * scale), height: Math.round(height * scale) }

  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('Could not capture the screen.')
  }
  return source.thumbnail.toPNG().toString('base64')
}
