import { randomUUID } from 'crypto'
import {
  IPC,
  type AnswerEntry,
  type AnswerKind,
  type DetectedQuestion,
  type ListenStatus,
  type QuestionType,
  type Session,
  type Speaker,
  type Toast,
  type TranscriptSegment
} from '@shared/types'
import { buildSystemPrompt, buildTask, buildUserText, formatTranscript, type TaskInput } from '@shared/prompts'
import { DeepgramStream } from './services/deepgram'
import { TranscriptAssembler } from './services/transcript'
import { QuestionDetector, type LlmVerdict } from './services/questionDetector'
import { checkQuestion, describeError, generateReport, streamAnswer } from './services/claude'
import { captureScreen } from './services/screenshot'
import { getActiveProfile, getApiKey, getSettings } from './services/store'
import { deleteSession, getSession, saveSession } from './services/sessions'
import { broadcast, withOverlayHiddenFromCapture } from './windows'

/** Wait this long after an interviewer utterance before deciding it was a question. */
const DETECT_DELAY_QUESTION_MARK = 300
const DETECT_DELAY_DEFAULT = 900
const SAVE_DEBOUNCE = 2000

interface RunAnswerInput {
  kind: AnswerKind
  title: string
  task: TaskInput
  questionId?: string
  image?: string
  needsReasoning?: boolean
}

export class Copilot {
  private status: ListenStatus = { state: 'idle' }
  private session: Session | null = null
  private deepgram: DeepgramStream | null = null
  private readonly assembler: TranscriptAssembler
  private readonly detector: QuestionDetector
  private turnBuffer: string[] = []
  private detectTimer: NodeJS.Timeout | null = null
  private saveTimer: NodeJS.Timeout | null = null
  private answerAbort: AbortController | null = null
  private detectorErrorShown = false

  constructor() {
    this.assembler = new TranscriptAssembler({
      onUpdate: (seg) => this.onSegmentUpdate(seg),
      onUtterance: (seg) => this.onUtterance(seg)
    })
    this.detector = new QuestionDetector((context, turn) => this.llmCheck(context, turn))
  }

  // ---------------------------------------------------------------- listening

  getStatus(): ListenStatus {
    return this.status
  }

  async start(): Promise<ListenStatus> {
    if (this.status.state !== 'idle' && this.status.state !== 'error') return this.status
    const key = getApiKey('deepgram')
    if (!key) {
      return this.setStatus({ state: 'error', message: 'Add your Deepgram API key in the dashboard (Ctrl+Shift+D).' })
    }
    if (!getApiKey('anthropic')) {
      this.toast('error', 'No Anthropic API key yet: transcription will work, answers will not.')
    }

    const profile = getActiveProfile()
    this.session = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      profileId: profile?.id ?? null,
      profileName: profile?.name ?? 'No profile',
      transcript: [],
      questions: [],
      answers: []
    }
    this.turnBuffer = []
    this.detector.reset()
    this.setStatus({ state: 'connecting', sessionId: this.session.id })

    const stream = new DeepgramStream(key, {
      onResult: (r) => this.assembler.handle(channelSpeaker(r.channel), r.text, r.isFinal, r.speechFinal),
      onUtteranceEnd: (channel) => this.assembler.utteranceEnd(channelSpeaker(channel)),
      onReconnecting: (attempt) =>
        this.setStatus({ state: 'reconnecting', message: `Reconnecting (attempt ${attempt})…`, sessionId: this.session?.id }),
      onReconnected: () => this.setStatus({ state: 'listening', sessionId: this.session?.id }),
      onFatal: (err) => {
        void this.stop().then(() => this.setStatus({ state: 'error', message: err.message }))
      }
    })
    this.deepgram = stream
    try {
      await stream.open()
    } catch (err) {
      this.deepgram = null
      this.session = null
      return this.setStatus({ state: 'error', message: (err as Error).message })
    }
    return this.setStatus({ state: 'listening', sessionId: this.session.id })
  }

  pushAudio(chunk: ArrayBuffer): void {
    this.deepgram?.send(Buffer.from(chunk))
  }

  async stop(): Promise<ListenStatus> {
    const stream = this.deepgram
    this.deepgram = null
    if (stream) await stream.close()
    this.assembler.finishAll()
    if (this.detectTimer) {
      clearTimeout(this.detectTimer)
      this.detectTimer = null
    }
    this.turnBuffer = []

    const session = this.session
    this.session = null
    if (session) {
      if (this.saveTimer) clearTimeout(this.saveTimer)
      this.saveTimer = null
      if (session.transcript.length === 0 && session.answers.length === 0) {
        deleteSession(session.id)
      } else {
        session.endedAt = new Date().toISOString()
        saveSession(session)
      }
      broadcast(IPC.evSessionsChanged)
    }
    return this.setStatus({ state: 'idle' })
  }

  private setStatus(status: ListenStatus): ListenStatus {
    this.status = status
    broadcast(IPC.evListenStatus, status)
    return status
  }

  // ---------------------------------------------------------------- transcript

  private onSegmentUpdate(seg: TranscriptSegment): void {
    broadcast(IPC.evTranscript, seg)
    if (seg.final || !seg.text) return
    if (seg.speaker === 'interviewer') {
      // Still talking: hold off deciding whether the turn was a question.
      if (this.detectTimer) {
        clearTimeout(this.detectTimer)
        this.detectTimer = null
      }
    } else if (this.detectTimer) {
      // I started answering, so the interviewer's turn is over.
      clearTimeout(this.detectTimer)
      this.detectTimer = null
      void this.runDetection()
    }
  }

  private onUtterance(seg: TranscriptSegment): void {
    if (!this.session) return
    this.session.transcript.push(seg)
    this.scheduleSave()
    if (seg.speaker !== 'interviewer') return
    this.turnBuffer.push(seg.text)
    if (this.detectTimer) clearTimeout(this.detectTimer)
    const delay = /\?\s*$/.test(seg.text) ? DETECT_DELAY_QUESTION_MARK : DETECT_DELAY_DEFAULT
    this.detectTimer = setTimeout(() => {
      this.detectTimer = null
      void this.runDetection()
    }, delay)
  }

  private async runDetection(): Promise<void> {
    const turn = this.turnBuffer.join(' ').trim()
    this.turnBuffer = []
    if (!turn || !this.session) return
    const session = this.session
    const context = formatTranscript(session.transcript.slice(-12), Date.parse(session.startedAt))
    const result = await this.detector.evaluate(turn, context)
    if (!result || this.session !== session) return

    const question: DetectedQuestion = { id: randomUUID(), text: result.text, type: result.type, ts: Date.now() }
    session.questions.push(question)
    this.scheduleSave()
    broadcast(IPC.evQuestion, question)
    if (getSettings().autoAnswer) void this.answerQuestion(question)
  }

  private async llmCheck(context: string, turn: string): Promise<LlmVerdict | null> {
    const key = getApiKey('anthropic')
    if (!key) return null
    try {
      return await checkQuestion(key, getSettings().detectModel, context, turn)
    } catch (err) {
      console.error('[Katoto] question check failed:', err)
      if (!this.detectorErrorShown) {
        this.detectorErrorShown = true
        this.toast('error', `Question detection: ${describeError(err)}`)
      }
      return null
    }
  }

  // ---------------------------------------------------------------- answers

  answerQuestion(q: { id?: string; text: string; type: QuestionType }): Promise<void> {
    return this.runAnswer({
      kind: 'question',
      title: q.text,
      questionId: q.id,
      task: { kind: 'question', question: q.text, questionType: q.type },
      needsReasoning: q.type === 'coding' || q.type === 'system_design'
    })
  }

  /** "What should I say?" — falls back to reading the screen when nothing has been said yet. */
  async assist(): Promise<void> {
    if (this.liveTranscript().length === 0) return this.screenshot()
    return this.runAnswer({ kind: 'assist', title: 'What should I say?', task: { kind: 'assist' } })
  }

  async screenshot(): Promise<void> {
    let image: string
    try {
      image = await withOverlayHiddenFromCapture(captureScreen)
    } catch (err) {
      this.toast('error', (err as Error).message)
      return
    }
    return this.runAnswer({
      kind: 'screenshot',
      title: 'Screen',
      task: { kind: 'screenshot', hasScreenshot: true },
      image,
      needsReasoning: true
    })
  }

  ask(text: string): Promise<void> {
    const q = text.trim()
    if (!q) return Promise.resolve()
    return this.runAnswer({ kind: 'ask', title: q, task: { kind: 'ask', askText: q } })
  }

  followups(): Promise<void> {
    return this.runAnswer({ kind: 'followups', title: 'Questions to ask them', task: { kind: 'followups' } })
  }

  recap(): Promise<void> {
    return this.runAnswer({ kind: 'recap', title: 'Recap so far', task: { kind: 'recap' } })
  }

  shorter(previousAnswer: string): Promise<void> {
    if (!previousAnswer.trim()) return Promise.resolve()
    return this.runAnswer({ kind: 'shorter', title: 'Shorter version', task: { kind: 'shorter', previousAnswer } })
  }

  cancel(): void {
    this.answerAbort?.abort()
  }

  private liveTranscript(): TranscriptSegment[] {
    return [...(this.session?.transcript ?? []), ...this.assembler.pending()]
  }

  private async runAnswer(input: RunAnswerInput): Promise<void> {
    const key = getApiKey('anthropic')
    if (!key) {
      this.toast('error', 'Add your Anthropic API key in the dashboard (Ctrl+Shift+D).')
      return
    }
    this.answerAbort?.abort()
    const abort = new AbortController()
    this.answerAbort = abort

    const entry: AnswerEntry = {
      id: randomUUID(),
      kind: input.kind,
      title: input.title.length > 300 ? `${input.title.slice(0, 297)}…` : input.title,
      questionId: input.questionId,
      text: '',
      ts: Date.now(),
      done: false
    }
    broadcast(IPC.evAnswerStart, entry)

    const settings = getSettings()
    const session = this.session
    const transcript = formatTranscript(this.liveTranscript(), session ? Date.parse(session.startedAt) : undefined)
    try {
      entry.text = await streamAnswer({
        apiKey: key,
        model: settings.answerModel,
        system: buildSystemPrompt(getActiveProfile()),
        userText: buildUserText(transcript, buildTask(input.task)),
        image: input.image,
        mode: settings.answerMode,
        needsReasoning: !!input.needsReasoning,
        signal: abort.signal,
        onDelta: (delta) => {
          entry.text += delta
          broadcast(IPC.evAnswerDelta, { id: entry.id, delta })
        }
      })
    } catch (err) {
      entry.error = abort.signal.aborted ? 'Stopped' : describeError(err)
      if (!abort.signal.aborted) console.error('[Katoto] answer failed:', err)
    } finally {
      entry.done = true
      if (this.answerAbort === abort) this.answerAbort = null
      broadcast(IPC.evAnswerDone, { id: entry.id, error: entry.error })
      if (session && this.session === session) {
        session.answers.push(entry)
        this.scheduleSave()
      }
    }
  }

  // ---------------------------------------------------------------- sessions

  async report(sessionId: string): Promise<string> {
    const key = getApiKey('anthropic')
    if (!key) throw new Error('Add your Anthropic API key first.')
    const live = this.session?.id === sessionId ? this.session : null
    const session = live ?? getSession(sessionId)
    if (!session) throw new Error('Session not found.')

    const transcript = session.transcript
      .map((s) => `${s.speaker === 'interviewer' ? 'Interviewer' : 'Me'}: ${s.text}`)
      .join('\n')
    const report = await generateReport(
      key,
      getSettings().answerModel,
      transcript,
      session.questions.map((q) => q.text)
    )
    session.report = report
    saveSession(session)
    broadcast(IPC.evSessionsChanged)
    return report
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      if (this.session) saveSession(this.session)
    }, SAVE_DEBOUNCE)
  }

  private toast(level: Toast['level'], message: string): void {
    broadcast(IPC.evToast, { level, message } satisfies Toast)
  }
}

function channelSpeaker(channel: number): Speaker {
  return channel === 0 ? 'interviewer' : 'me'
}
