/** Converts one float sample in [-1, 1] to signed 16-bit PCM. */
export function floatToInt16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample))
  return s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff)
}

/**
 * Interleaves two float channels into little-endian 16-bit PCM
 * (L0 R0 L1 R1 ...), the layout Deepgram expects for multichannel audio.
 */
export function interleaveInt16(left: Float32Array, right: Float32Array): Int16Array {
  const n = Math.min(left.length, right.length)
  const out = new Int16Array(n * 2)
  for (let i = 0; i < n; i++) {
    out[i * 2] = floatToInt16(left[i])
    out[i * 2 + 1] = floatToInt16(right[i])
  }
  return out
}

/** Root-mean-square level of a block, 0..1. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}
