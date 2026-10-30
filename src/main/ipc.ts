import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import path from 'path'
import {
  IPC,
  type ApiKeysInput,
  type KeyTestResult,
  type Profile,
  type Settings
} from '@shared/types'
import type { Copilot } from './copilot'
import {
  deleteProfile,
  getApiKey,
  getKeyStatus,
  getSettings,
  listProfiles,
  saveProfile,
  setApiKeys,
  updateSettings
} from './services/store'
import { deleteSession, getSession, listSessions } from './services/sessions'
import { extractDocumentText, SUPPORTED_EXTENSIONS } from './services/documents'
import { testAnthropicKey } from './services/claude'
import { testDeepgramKey } from './services/deepgram'
import {
  applyContentProtection,
  broadcast,
  hideOverlay,
  openDashboard,
  overlayState,
  resizeOverlay,
  setOpacity,
  toggleClickThrough
} from './windows'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Keeps only known settings keys with the right value types. */
function sanitizeSettings(patch: unknown): Partial<Settings> {
  if (!patch || typeof patch !== 'object') return {}
  const p = patch as Record<string, unknown>
  const out: Partial<Settings> = {}
  if (typeof p.overlayOpacity === 'number') out.overlayOpacity = p.overlayOpacity
  if (typeof p.contentProtection === 'boolean') out.contentProtection = p.contentProtection
  if (typeof p.autoAnswer === 'boolean') out.autoAnswer = p.autoAnswer
  if (typeof p.captureMic === 'boolean') out.captureMic = p.captureMic
  if (p.answerMode === 'fast' || p.answerMode === 'thorough') out.answerMode = p.answerMode
  if (typeof p.answerModel === 'string' && p.answerModel.startsWith('claude-')) out.answerModel = p.answerModel
  if (typeof p.detectModel === 'string' && p.detectModel.startsWith('claude-')) out.detectModel = p.detectModel
  if (typeof p.activeProfileId === 'string' || p.activeProfileId === null) out.activeProfileId = p.activeProfileId
  if (typeof p.micDeviceId === 'string' || p.micDeviceId === null) out.micDeviceId = p.micDeviceId
  return out
}

export function registerIpc(copilot: Copilot): void {
  // settings & keys
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsUpdate, (_e, patch: unknown) => {
    const prev = getSettings()
    const next = updateSettings(sanitizeSettings(patch))
    if (next.contentProtection !== prev.contentProtection) applyContentProtection(next.contentProtection)
    if (next.overlayOpacity !== prev.overlayOpacity) setOpacity(next.overlayOpacity)
    broadcast(IPC.evSettings, next)
    return next
  })
  ipcMain.handle(IPC.keysStatus, () => getKeyStatus())
  ipcMain.handle(IPC.keysSet, (_e, input: ApiKeysInput) => {
    const status = setApiKeys({
      anthropic: typeof input?.anthropic === 'string' ? input.anthropic : undefined,
      deepgram: typeof input?.deepgram === 'string' ? input.deepgram : undefined
    })
    // Lets the overlay refresh its "add your keys" hint.
    broadcast(IPC.evSettings, getSettings())
    return status
  })
  ipcMain.handle(IPC.keysTest, async (): Promise<KeyTestResult> => {
    const anthropic = getApiKey('anthropic')
    const deepgram = getApiKey('deepgram')
    const [a, d] = await Promise.all([
      anthropic ? testAnthropicKey(anthropic) : Promise.resolve('Not set.'),
      deepgram ? testDeepgramKey(deepgram) : Promise.resolve('Not set.')
    ])
    return { anthropic: a ?? undefined, deepgram: d ?? undefined }
  })

  // profiles
  ipcMain.handle(IPC.profilesList, () => listProfiles())
  ipcMain.handle(IPC.profilesSave, (_e, p: Partial<Profile>) => {
    const saved = saveProfile({
      id: str(p?.id) || undefined,
      name: str(p?.name),
      resume: str(p?.resume),
      jobDescription: str(p?.jobDescription),
      company: str(p?.company),
      instructions: str(p?.instructions)
    })
    broadcast(IPC.evSettings, getSettings())
    return saved
  })
  ipcMain.handle(IPC.profilesDelete, (_e, id: unknown) => {
    deleteProfile(str(id))
    broadcast(IPC.evSettings, getSettings())
  })
  ipcMain.handle(IPC.profilesImportFile, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: SUPPORTED_EXTENSIONS }]
    }
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (res.canceled || !res.filePaths[0]) return null
    const file = res.filePaths[0]
    return { fileName: path.basename(file), text: await extractDocumentText(file) }
  })

  // listening
  ipcMain.handle(IPC.listenStart, () => copilot.start())
  ipcMain.handle(IPC.listenStop, () => copilot.stop())
  ipcMain.handle(IPC.listenStatus, () => copilot.getStatus())
  ipcMain.on(IPC.audioChunk, (_e, chunk: unknown) => {
    if (chunk instanceof ArrayBuffer) copilot.pushAudio(chunk)
    else if (ArrayBuffer.isView(chunk)) copilot.pushAudio(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer)
  })

  // AI actions
  ipcMain.handle(IPC.aiAssist, () => copilot.assist())
  ipcMain.handle(IPC.aiScreenshot, () => copilot.screenshot())
  ipcMain.handle(IPC.aiAsk, (_e, text: unknown) => copilot.ask(str(text)))
  ipcMain.handle(IPC.aiFollowups, () => copilot.followups())
  ipcMain.handle(IPC.aiRecap, () => copilot.recap())
  ipcMain.handle(IPC.aiShorter, (_e, text: unknown) => copilot.shorter(str(text)))
  ipcMain.handle(IPC.aiCancel, () => copilot.cancel())

  // sessions
  ipcMain.handle(IPC.sessionsList, () => listSessions())
  ipcMain.handle(IPC.sessionsGet, (_e, id: unknown) => getSession(str(id)))
  ipcMain.handle(IPC.sessionsDelete, (_e, id: unknown) => {
    deleteSession(str(id))
    broadcast(IPC.evSessionsChanged)
  })
  ipcMain.handle(IPC.sessionsReport, (_e, id: unknown) => copilot.report(str(id)))

  // windows
  ipcMain.handle(IPC.overlayState, () => overlayState())
  ipcMain.handle(IPC.overlaySetOpacity, (_e, v: unknown) => (typeof v === 'number' ? setOpacity(v) : overlayState()))
  ipcMain.handle(IPC.overlayToggleClickThrough, () => toggleClickThrough())
  ipcMain.handle(IPC.overlayResize, (_e, h: unknown) => {
    if (typeof h === 'number') resizeOverlay(h)
  })
  ipcMain.handle(IPC.overlayHide, () => hideOverlay())
  ipcMain.handle(IPC.dashboardOpen, () => openDashboard())
  ipcMain.handle(IPC.appQuit, () => app.quit())
}
