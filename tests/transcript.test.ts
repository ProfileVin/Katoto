import { describe, expect, it } from 'vitest'
import type { TranscriptSegment } from '../src/shared/types'
import { TranscriptAssembler } from '../src/main/services/transcript'

function setup(): { a: TranscriptAssembler; updates: TranscriptSegment[]; done: TranscriptSegment[] } {
  const updates: TranscriptSegment[] = []
  const done: TranscriptSegment[] = []
  const a = new TranscriptAssembler({ onUpdate: (s) => updates.push(s), onUtterance: (s) => done.push(s) }, () => 1000)
  return { a, updates, done }
}

describe('TranscriptAssembler', () => {
  it('builds one utterance from interim and final results', () => {
    const { a, updates, done } = setup()
    a.handle('interviewer', 'Tell me', false, false)
    a.handle('interviewer', 'Tell me about', true, false)
    a.handle('interviewer', 'yourself', false, false)
    a.handle('interviewer', 'yourself.', true, true)

    expect(updates.map((u) => u.text)).toEqual(['Tell me', 'Tell me about', 'Tell me about yourself', 'Tell me about yourself.', 'Tell me about yourself.'])
    expect(new Set(updates.map((u) => u.id)).size).toBe(1)
    expect(done).toHaveLength(1)
    expect(done[0]).toMatchObject({ speaker: 'interviewer', text: 'Tell me about yourself.', final: true, ts: 1000 })
  })

  it('finishes an utterance on UtteranceEnd', () => {
    const { a, done } = setup()
    a.handle('me', 'I have five years', true, false)
    expect(done).toHaveLength(0)
    a.utteranceEnd('me')
    expect(done.map((d) => d.text)).toEqual(['I have five years'])
    a.utteranceEnd('me')
    expect(done).toHaveLength(1)
  })

  it('keeps speakers separate and exposes pending speech', () => {
    const { a, done } = setup()
    a.handle('interviewer', 'So why', false, false)
    a.handle('me', 'Sure', true, false)
    expect(a.pending().map((p) => [p.speaker, p.text])).toEqual([
      ['interviewer', 'So why'],
      ['me', 'Sure']
    ])
    a.finishAll()
    expect(done.map((d) => d.speaker)).toEqual(['interviewer', 'me'])
    expect(a.pending()).toEqual([])
  })

  it('ignores empty results', () => {
    const { a, updates, done } = setup()
    a.handle('interviewer', '', true, true)
    a.handle('interviewer', '   ', false, false)
    expect(updates).toHaveLength(0)
    expect(done).toHaveLength(0)
  })
})
