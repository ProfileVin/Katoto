import workletUrl from './pcm-worklet.ts?worker&url'

export const SAMPLE_RATE = 16000

export interface CaptureOptions {
  captureMic: boolean
  micDeviceId: string | null
}

export interface CaptureCallbacks {
  onChunk(pcm: ArrayBuffer): void
  onLevels(system: number, mic: number): void
  onEnded(reason: string): void
}

export interface CaptureResult {
  mic: boolean
  micError?: string
}

/**
 * Captures system audio (Windows loopback via getDisplayMedia) and the
 * microphone, and mixes them into a 2-channel 16 kHz stream:
 * channel 0 = the other side of the call, channel 1 = me.
 */
export class AudioCapture {
  private ctx: AudioContext | null = null
  private streams: MediaStream[] = []
  private node: AudioWorkletNode | null = null

  get active(): boolean {
    return this.ctx !== null
  }

  async start(opts: CaptureOptions, cb: CaptureCallbacks): Promise<CaptureResult> {
    await this.stop()
    try {
      return await this.open(opts, cb)
    } catch (err) {
      await this.stop()
      throw err
    }
  }

  private async open(opts: CaptureOptions, cb: CaptureCallbacks): Promise<CaptureResult> {
    let display: MediaStream
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
    } catch (err) {
      throw new Error(`Could not capture system audio: ${(err as Error).message}`)
    }
    this.streams.push(display)
    // We only want the loopback audio; drop the screen video right away.
    for (const t of display.getVideoTracks()) {
      t.stop()
      display.removeTrack(t)
    }
    const systemTrack = display.getAudioTracks()[0]
    if (!systemTrack) throw new Error('System audio capture is not available on this computer.')

    let mic: MediaStream | null = null
    let micError: string | undefined
    if (opts.captureMic) {
      try {
        mic = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: opts.micDeviceId ? { exact: opts.micDeviceId } : undefined,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        })
        this.streams.push(mic)
      } catch (err) {
        micError = `Microphone unavailable (${(err as Error).message}). Only the interviewer will be transcribed.`
      }
    }

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
    this.ctx = ctx
    await ctx.audioWorklet.addModule(workletUrl)

    // Merger inputs are mono, so each source is down-mixed into its own channel.
    const merger = ctx.createChannelMerger(2)
    ctx.createMediaStreamSource(display).connect(merger, 0, 0)
    if (mic) ctx.createMediaStreamSource(mic).connect(merger, 0, 1)

    const node = new AudioWorkletNode(ctx, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    })
    node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; levels: [number, number] }>) => {
      cb.onChunk(e.data.pcm)
      cb.onLevels(e.data.levels[0], e.data.levels[1])
    }
    merger.connect(node)
    // The graph only runs when it reaches the destination; route it through a muted gain.
    const sink = ctx.createGain()
    sink.gain.value = 0
    node.connect(sink).connect(ctx.destination)
    this.node = node

    systemTrack.addEventListener('ended', () => cb.onEnded('System audio capture stopped.'))
    if (ctx.state === 'suspended') await ctx.resume()
    return { mic: !!mic, micError }
  }

  async stop(): Promise<void> {
    if (this.node) {
      this.node.port.onmessage = null
      this.node.disconnect()
      this.node = null
    }
    for (const s of this.streams) for (const t of s.getTracks()) t.stop()
    this.streams = []
    if (this.ctx) {
      const ctx = this.ctx
      this.ctx = null
      await ctx.close().catch(() => {})
    }
  }
}

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'audioinput')
}
