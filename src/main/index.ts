import { app, desktopCapturer, globalShortcut, session } from 'electron'
import { IPC } from '@shared/types'
import { Copilot } from './copilot'
import { registerIpc } from './ipc'
import { registerShortcuts } from './shortcuts'
import { createTray } from './tray'
import { broadcast, createOverlay, openDashboard, showOverlay } from './windows'
import { getKeyStatus } from './services/store'

const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture'])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const copilot = new Copilot()
  let quitting = false

  app.on('second-instance', () => showOverlay())

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.Katoto.app')

    // getDisplayMedia() in the overlay resolves to the whole screen plus
    // Windows system-audio loopback: that is how we hear the other side of the call.
    session.defaultSession.setDisplayMediaRequestHandler(
      (_request, callback) => {
        desktopCapturer
          .getSources({ types: ['screen'] })
          .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
          .catch((err) => {
            console.error('[Katoto] display media request failed:', err)
            callback({})
          })
      },
      { useSystemPicker: false }
    )
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(ALLOWED_PERMISSIONS.has(permission)))
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))

    registerIpc(copilot)
    const overlay = createOverlay()
    createTray()

    const failed = registerShortcuts(copilot)
    if (failed.length) {
      overlay.webContents.once('did-finish-load', () => {
        broadcast(IPC.evToast, {
          level: 'error',
          message: `These hotkeys are taken by another app: ${failed.join(', ')}`
        })
      })
    }

    const keys = getKeyStatus()
    if (!keys.anthropic || !keys.deepgram) openDashboard()
  })

  // The overlay lives in the tray; closing the dashboard must not quit the app.
  app.on('window-all-closed', () => {})

  // Flush and save the running session before quitting.
  app.on('before-quit', (event) => {
    if (quitting || copilot.getStatus().state === 'idle') return
    event.preventDefault()
    quitting = true
    void copilot.stop().finally(() => app.quit())
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())
}
