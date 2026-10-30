import { app, safeStorage } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'
import { DEFAULT_SETTINGS, type ApiKeysInput, type KeyStatus, type Profile, type Settings } from '@shared/types'
import { readJson, writeJson } from './jsonFile'

type KeyName = 'anthropic' | 'deepgram'

/** On-disk shape of keys.json: base64 ciphertext from safeStorage, or plain text when encryption is unavailable. */
interface StoredKeys {
  encrypted: boolean
  anthropic?: string
  deepgram?: string
}

const dataDir = (): string => app.getPath('userData')
const settingsFile = (): string => path.join(dataDir(), 'settings.json')
const keysFile = (): string => path.join(dataDir(), 'keys.json')
const profilesFile = (): string => path.join(dataDir(), 'profiles.json')

let settingsCache: Settings | null = null

export function getSettings(): Settings {
  if (!settingsCache) {
    settingsCache = { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(settingsFile(), {}) }
  }
  return settingsCache
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  next.overlayOpacity = Math.min(1, Math.max(0.2, next.overlayOpacity))
  settingsCache = next
  writeJson(settingsFile(), next)
  return next
}

function readKeys(): StoredKeys {
  return readJson<StoredKeys>(keysFile(), { encrypted: safeStorage.isEncryptionAvailable() })
}

export function getApiKey(name: KeyName): string | null {
  const stored = readKeys()
  const value = stored[name]
  if (!value) return null
  if (!stored.encrypted) return value
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch (err) {
    console.error(`[Katoto] could not decrypt ${name} key:`, err)
    return null
  }
}

export function setApiKeys(input: ApiKeysInput): KeyStatus {
  const encrypted = safeStorage.isEncryptionAvailable()
  // Re-encode both keys with the current mode so the file stays consistent.
  const next: StoredKeys = { encrypted }
  for (const name of ['anthropic', 'deepgram'] as const) {
    const incoming = input[name]
    const plain = incoming !== undefined ? incoming.trim() : getApiKey(name)
    if (plain) next[name] = encrypted ? safeStorage.encryptString(plain).toString('base64') : plain
  }
  writeJson(keysFile(), next)
  return getKeyStatus()
}

export function getKeyStatus(): KeyStatus {
  const stored = readKeys()
  return {
    anthropic: !!stored.anthropic,
    deepgram: !!stored.deepgram,
    encryptionAvailable: safeStorage.isEncryptionAvailable()
  }
}

export function listProfiles(): Profile[] {
  return readJson<Profile[]>(profilesFile(), [])
}

export function getProfile(id: string | null): Profile | null {
  if (!id) return null
  return listProfiles().find((p) => p.id === id) ?? null
}

export function getActiveProfile(): Profile | null {
  return getProfile(getSettings().activeProfileId)
}

export function saveProfile(input: Omit<Profile, 'id' | 'updatedAt'> & { id?: string }): Profile {
  const profiles = listProfiles()
  const profile: Profile = {
    id: input.id || randomUUID(),
    name: input.name.trim() || 'Untitled profile',
    resume: input.resume,
    jobDescription: input.jobDescription,
    company: input.company,
    instructions: input.instructions,
    updatedAt: new Date().toISOString()
  }
  const idx = profiles.findIndex((p) => p.id === profile.id)
  if (idx >= 0) profiles[idx] = profile
  else profiles.push(profile)
  writeJson(profilesFile(), profiles)
  if (!getSettings().activeProfileId) updateSettings({ activeProfileId: profile.id })
  return profile
}

export function deleteProfile(id: string): void {
  writeJson(
    profilesFile(),
    listProfiles().filter((p) => p.id !== id)
  )
  if (getSettings().activeProfileId === id) updateSettings({ activeProfileId: null })
}
