import WebSocket from 'ws'

export const SAMPLE_RATE = 16000
export const CHANNELS = 2

const QUERY = new URLSearchParams({
  model: 'nova-3',
  language: 'en',
  encoding: 'linear16',
  sample_rate: String(SAMPLE_RATE),
  channels: String(CHANNELS),
  multichannel: 'true',
  interim_results: 'true',
  smart_format: 'true',
  punctuate: 'true',
  endpointing: '300',
  utterance_end_ms: '1000',
  vad_events: 'true'
})
const URL = `wss://api.deepgram.com/v1/listen?${QUERY}`

const KEEPALIVE_MS = 8000
const MAX_RECONNECTS = 5

export interface DeepgramResult {
  channel: number
  text: string
  isFinal: boolean
  speechFinal: boolean
}

export interface DeepgramHandlers {
  onResult(result: DeepgramResult): void
  onUtteranceEnd(channel: number): void
  onReconnecting(attempt: number): void
  onReconnected(): void
  /** The stream died and could not be re-established. */
  onFatal(error: Error): void
}

interface DeepgramMessage {
  type: string
  channel_index?: number[]
  channel?: { alternatives?: { transcript?: string }[] } | number[]
  is_final?: boolean
  speech_final?: boolean
}

function friendlyError(err: Error): Error {
  if (/401|403/.test(err.message)) return new Error('Deepgram rejected the API key. Check it in Settings.')
  if (/402/.test(err.message)) return new Error('Deepgram account is out of credit.')
  return new Error(`Deepgram connection failed: ${err.message}`)
}

/** One live Deepgram streaming session. Channel 0 = interviewer (system audio), channel 1 = me (mic). */
export class DeepgramStream {
  private ws: WebSocket | null = null
  private keepAlive: NodeJS.Timeout | null = null
  private closing = false

  constructor(
    private readonly apiKey: string,
    private readonly handlers: DeepgramHandlers
  ) {}

  open(): Promise<void> {
    this.closing = false
    return this.connect().catch((err: Error) => {
      throw friendlyError(err)
    })
  }

  send(pcm: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm)
  }

  /** Ask Deepgram to flush final results, then close. */
  async close(): Promise<void> {
    this.closing = true
    this.stopKeepAlive()
    const ws = this.ws
    if (!ws) return
    if (ws.readyState !== WebSocket.OPEN) {
      ws.terminate()
      return
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        ws.terminate()
        resolve()
      }, 3000)
      ws.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
      ws.send(JSON.stringify({ type: 'CloseStream' }))
    })
    this.ws = null
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(URL, { headers: { Authorization: `Token ${this.apiKey}` } })
      this.ws = ws
      let opened = false

      ws.on('open', () => {
        opened = true
        this.startKeepAlive()
        resolve()
      })
      ws.on('message', (data, isBinary) => {
        if (!isBinary) this.handleMessage(data.toString())
      })
      ws.on('error', (err) => {
        if (!opened) reject(err)
        else console.error('[Katoto] deepgram socket error:', err.message)
      })
      ws.on('close', (code) => {
        if (this.ws === ws) {
          this.stopKeepAlive()
          this.ws = null
        }
        if (opened && !this.closing) void this.reconnect(code)
      })
    })
  }

  private async reconnect(code: number): Promise<void> {
    console.warn(`[Katoto] deepgram closed unexpectedly (code ${code}), reconnecting`)
    for (let attempt = 1; attempt <= MAX_RECONNECTS && !this.closing; attempt++) {
      this.handlers.onReconnecting(attempt)
      await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)))
      if (this.closing) return
      try {
        await this.connect()
        this.handlers.onReconnected()
        return
      } catch (err) {
        console.warn(`[Katoto] deepgram reconnect ${attempt} failed:`, (err as Error).message)
      }
    }
    if (!this.closing) this.handlers.onFatal(new Error('Lost the connection to Deepgram.'))
  }

  private handleMessage(raw: string): void {
    let msg: DeepgramMessage
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (msg.type === 'Results') {
      const alt = !Array.isArray(msg.channel) ? msg.channel?.alternatives?.[0] : undefined
      this.handlers.onResult({
        channel: msg.channel_index?.[0] ?? 0,
        text: alt?.transcript ?? '',
        isFinal: !!msg.is_final,
        speechFinal: !!msg.speech_final
      })
    } else if (msg.type === 'UtteranceEnd') {
      const channel = Array.isArray(msg.channel) ? msg.channel[0] : 0
      this.handlers.onUtteranceEnd(channel ?? 0)
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive()
    this.keepAlive = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'KeepAlive' }))
    }, KEEPALIVE_MS)
  }

  private stopKeepAlive(): void {
    if (this.keepAlive) clearInterval(this.keepAlive)
    this.keepAlive = null
  }
}

/** Cheap authenticated call to validate a Deepgram key. Returns an error message or null. */
export async function testDeepgramKey(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${apiKey}` }
    })
    if (res.ok) return null
    return res.status === 401 || res.status === 403 ? 'Deepgram rejected this key.' : `Deepgram returned HTTP ${res.status}.`
  } catch (err) {
    return `Could not reach Deepgram: ${(err as Error).message}`
  }
}
