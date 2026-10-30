// AudioWorklet: collects the 2-channel mix (0 = system audio, 1 = mic) at the
// context rate (16 kHz) and posts 100 ms blocks of interleaved 16-bit PCM.
import { interleaveInt16, rms } from '@shared/pcm'

declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

const CHUNK_FRAMES = 1600

class PcmCapture extends AudioWorkletProcessor {
  private left = new Float32Array(CHUNK_FRAMES)
  private right = new Float32Array(CHUNK_FRAMES)
  private pos = 0

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const l = input[0]
    const r = input[1] ?? new Float32Array(l.length)
    let i = 0
    while (i < l.length) {
      const n = Math.min(l.length - i, CHUNK_FRAMES - this.pos)
      this.left.set(l.subarray(i, i + n), this.pos)
      this.right.set(r.subarray(i, i + n), this.pos)
      this.pos += n
      i += n
      if (this.pos === CHUNK_FRAMES) this.flush()
    }
    return true
  }

  private flush(): void {
    const pcm = interleaveInt16(this.left, this.right)
    this.port.postMessage({ pcm: pcm.buffer, levels: [rms(this.left), rms(this.right)] }, [pcm.buffer])
    this.pos = 0
  }
}

registerProcessor('pcm-capture', PcmCapture)
