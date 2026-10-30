import { globalShortcut } from 'electron'
import { IPC, type HotkeyAction } from '@shared/types'
import type { Copilot } from './copilot'
import {
  broadcast,
  moveOverlay,
  openDashboard,
  showOverlay,
  toggleClickThrough,
  toggleOverlay
} from './windows'

// Keep src/shared/hotkeys.ts (the help list shown in the UI) in sync with this file.

function sendHotkey(action: HotkeyAction): void {
  broadcast(IPC.evHotkey, action)
}

/** Registers global hotkeys. Returns the accelerators that another app already owns. */
export function registerShortcuts(copilot: Copilot): string[] {
  const actions: Record<string, () => void> = {
    'CommandOrControl+\\': toggleOverlay,
    // Listening is started by the overlay because audio capture lives in the renderer.
    'CommandOrControl+Shift+L': () => {
      showOverlay()
      sendHotkey('toggle-listen')
    },
    'CommandOrControl+Enter': () => {
      showOverlay()
      void copilot.assist()
    },
    'CommandOrControl+Shift+S': () => {
      void copilot.screenshot()
    },
    'CommandOrControl+Shift+Space': () => {
      showOverlay(true)
      sendHotkey('focus-ask')
    },
    'CommandOrControl+Shift+M': () => {
      toggleClickThrough()
    },
    'CommandOrControl+Shift+D': openDashboard,
    'CommandOrControl+Alt+Up': () => moveOverlay(0, -1),
    'CommandOrControl+Alt+Down': () => moveOverlay(0, 1),
    'CommandOrControl+Alt+Left': () => moveOverlay(-1, 0),
    'CommandOrControl+Alt+Right': () => moveOverlay(1, 0)
  }

  const failed: string[] = []
  for (const [accelerator, fn] of Object.entries(actions)) {
    try {
      if (!globalShortcut.register(accelerator, fn)) failed.push(accelerator)
    } catch {
      failed.push(accelerator)
    }
  }
  return failed
}
