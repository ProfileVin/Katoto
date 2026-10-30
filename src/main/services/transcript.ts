import { randomUUID } from 'crypto'
import type { Speaker, TranscriptSegment } from '@shared/types'

interface OpenUtterance {
  id: string
  ts: number
  finals: string[]
  interim: string
}

export interface AssemblerEvents {
  /** Live update of an in-progress or just-finished utterance (for display). */
  onUpdate(segment: TranscriptSegment): void
  /** An utterance is complete. */
  onUtterance(segment: TranscriptSegment): void
}

/**
 * Turns Deepgram's interim/final result stream into one segment per utterance
 * per speaker, with a stable id so the UI can update it in place.
 */
export class TranscriptAssembler {
  private open: Record<Speaker, OpenUtterance | null> = { interviewer: null, me: null }

  constructor(
    private readonly events: AssemblerEvents,
    private readonly now: () => number = Date.now
  ) {}

  handle(speaker: Speaker, text: string, isFinal: boolean, speechFinal: boolean): void {
    const clean = text.trim()
    let cur = this.open[speaker]
    if (clean && !cur) {
      cur = { id: randomUUID(), ts: this.now(), finals: [], interim: '' }
      this.open[speaker] = cur
    }
    if (cur) {
      if (isFinal) {
        if (clean) cur.finals.push(clean)
        cur.interim = ''
      } else {
        cur.interim = clean
      }
      this.events.onUpdate(this.segment(speaker, cur, false))
    }
    if (speechFinal) this.finish(speaker)
  }

  utteranceEnd(speaker: Speaker): void {
    this.finish(speaker)
  }

  /** Utterances still in progress, for including live speech in prompts. */
  pending(): TranscriptSegment[] {
    return (['interviewer', 'me'] as const).flatMap((speaker) => {
      const cur = this.open[speaker]
      if (!cur) return []
      const seg = this.segment(speaker, cur, false)
      return seg.text ? [seg] : []
    })
  }

  finishAll(): void {
    this.finish('interviewer')
    this.finish('me')
  }

  private finish(speaker: Speaker): void {
    const cur = this.open[speaker]
    if (!cur) return
    this.open[speaker] = null
    const seg = this.segment(speaker, cur, true)
    if (!seg.text) return
    this.events.onUpdate(seg)
    this.events.onUtterance(seg)
  }

  private segment(speaker: Speaker, cur: OpenUtterance, final: boolean): TranscriptSegment {
    const text = [...cur.finals, cur.interim].filter(Boolean).join(' ').trim()
    return { id: cur.id, speaker, text, ts: cur.ts, final }
  }
}
