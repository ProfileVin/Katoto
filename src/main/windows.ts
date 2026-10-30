import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { IPC, type OverlayState } from '@shared/types'
import { getSettings, updateSettings } from './services/store'

const OVERLAY_WIDTH = 580
const MOVE_STEP = 48

let overlay: BrowserWindow | null = null
let dashboard: BrowserWindow | null = null
let clickThrough = false

function loadPage(win: BrowserWindow, page: 'overlay' | 'dashboard'): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page}.html`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}.html`))
  }
}

function hardenWebContents(win: BrowserWindow): void {
  // Open links from answers in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? 'file://')) event.preventDefault()
  })
}

const preload = (): string => join(__dirname, '../preload/index.js')

export function createOverlay(): BrowserWindow {
  const settings = getSettings()
  const { workArea } = screen.getPrimaryDisplay()
  overlay = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: 140,
    x: workArea.x + Math.round((workArea.width - OVERLAY_WIDTH) / 2),
    y: workArea.y + 24,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: 'Katoto',
    webPreferences: {
      preload: preload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep audio processing and timers running while another app has focus.
      backgroundThrottling: false,
      // Listening can start from a global hotkey, with no click in this window.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlay.setContentProtection(settings.contentProtection)
  overlay.setOpacity(settings.overlayOpacity)
  hardenWebContents(overlay)
  // showInactive: never steal focus from the meeting app.
  overlay.once('ready-to-show', () => overlay?.showInactive())
  overlay.on('closed', () => {
    overlay = null
  })
  loadPage(overlay, 'overlay')
  return overlay
}

export function getOverlay(): BrowserWindow | null {
  return overlay
}

export function openDashboard(): void {
  if (dashboard) {
    if (dashboard.isMinimized()) dashboard.restore()
    dashboard.show()
    dashboard.focus()
    return
  }
  dashboard = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    show: false,
    title: 'Katoto',
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  dashboard.setContentProtection(getSettings().contentProtection)
  hardenWebContents(dashboard)
  dashboard.once('ready-to-show', () => dashboard?.show())
  dashboard.on('closed', () => {
    dashboard = null
  })
  loadPage(dashboard, 'dashboard')
}

export function broadcast(channel: string, payload?: unknown): void {
  for (const win of [overlay, dashboard]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function overlayState(): OverlayState {
  const s = getSettings()
  return { clickThrough, contentProtection: s.contentProtection, opacity: s.overlayOpacity }
}

function emitOverlayState(): void {
  broadcast(IPC.evOverlayState, overlayState())
}

export function toggleOverlay(): void {
  if (!overlay) return
  if (overlay.isVisible()) overlay.hide()
  else overlay.showInactive()
}

export function showOverlay(focus = false): void {
  if (!overlay) return
  if (focus) {
    overlay.show()
    overlay.focus()
  } else if (!overlay.isVisible()) {
    overlay.showInactive()
  }
}

export function hideOverlay(): void {
  overlay?.hide()
}

export function moveOverlay(dx: number, dy: number): void {
  if (!overlay) return
  const [x, y] = overlay.getPosition()
  overlay.setPosition(x + dx * MOVE_STEP, y + dy * MOVE_STEP)
}

export function resizeOverlay(height: number): void {
  if (!overlay || !Number.isFinite(height)) return
  const display = screen.getDisplayMatching(overlay.getBounds())
  const max = Math.round(display.workArea.height * 0.85)
  const h = Math.max(60, Math.min(max, Math.ceil(height)))
  const bounds = overlay.getBounds()
  if (bounds.height !== h) overlay.setBounds({ ...bounds, width: OVERLAY_WIDTH, height: h })
}

export function toggleClickThrough(): OverlayState {
  clickThrough = !clickThrough
  overlay?.setIgnoreMouseEvents(clickThrough, { forward: true })
  emitOverlayState()
  return overlayState()
}

export function setOpacity(opacity: number): OverlayState {
  const s = updateSettings({ overlayOpacity: opacity })
  overlay?.setOpacity(s.overlayOpacity)
  emitOverlayState()
  return overlayState()
}

export function applyContentProtection(enabled: boolean): void {
  overlay?.setContentProtection(enabled)
  dashboard?.setContentProtection(enabled)
  emitOverlayState()
}

/**
 * Runs `fn` with the overlay hidden when it would otherwise appear in a
 * screen capture (content protection off).
 */
export async function withOverlayHiddenFromCapture<T>(fn: () => Promise<T>): Promise<T> {
  const mustHide = !!overlay?.isVisible() && !getSettings().contentProtection
  if (!mustHide) return fn()
  overlay?.hide()
  await new Promise((r) => setTimeout(r, 180))
  try {
    return await fn()
  } finally {
    overlay?.showInactive()
  }
}
