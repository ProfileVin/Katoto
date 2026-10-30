import { Menu, Tray, app, nativeImage } from 'electron'
import { IPC } from '@shared/types'
import { broadcast, openDashboard, showOverlay, toggleOverlay } from './windows'

let tray: Tray | null = null

/** Draws a 32x32 violet dot so the app needs no icon file on disk. */
function trayIcon(): Electron.NativeImage {
  const size = 32
  const buf = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c)
      const alpha = Math.max(0, Math.min(1, 14.5 - d))
      const i = (y * size + x) * 4
      // BGRA
      buf[i] = 0xf6
      buf[i + 1] = 0x5c
      buf[i + 2] = 0x8b
      buf[i + 3] = Math.round(alpha * 255)
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 })
}

export function createTray(): void {
  tray = new Tray(trayIcon())
  tray.setToolTip('Katoto')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show / hide overlay', click: toggleOverlay },
      {
        label: 'Start / stop listening',
        click: () => {
          showOverlay()
          broadcast(IPC.evHotkey, 'toggle-listen')
        }
      },
      { label: 'Dashboard', click: openDashboard },
      { type: 'separator' },
      { label: 'Quit Katoto', click: () => app.quit() }
    ])
  )
  tray.on('click', toggleOverlay)
}
