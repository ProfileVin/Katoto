import { describe, expect, it } from 'vitest'
import { floatToInt16, interleaveInt16, rms } from '../src/shared/pcm'

describe('floatToInt16', () => {
  it('maps the float range onto int16 and clamps', () => {
    expect(floatToInt16(0)).toBe(0)
    expect(floatToInt16(1)).toBe(32767)
    expect(floatToInt16(-1)).toBe(-32768)
    expect(floatToInt16(2)).toBe(32767)
    expect(floatToInt16(-3)).toBe(-32768)
    expect(floatToInt16(0.5)).toBe(16384)
  })
})

describe('interleaveInt16', () => {
  it('interleaves left and right samples', () => {
    const out = interleaveInt16(new Float32Array([1, 0, -1]), new Float32Array([0, 0.5, 0]))
    expect(Array.from(out)).toEqual([32767, 0, 0, 16384, -32768, 0])
  })

  it('produces little-endian bytes Deepgram can read as linear16', () => {
    const out = interleaveInt16(new Float32Array([1]), new Float32Array([-1]))
    const bytes = new Uint8Array(out.buffer)
    expect(Array.from(bytes)).toEqual([0xff, 0x7f, 0x00, 0x80])
  })
})

describe('rms', () => {
  it('computes root-mean-square level', () => {
    expect(rms(new Float32Array([]))).toBe(0)
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5)
  })
})
