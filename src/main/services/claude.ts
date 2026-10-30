import Anthropic from '@anthropic-ai/sdk'
import type { AnswerMode } from '@shared/types'
import {
  DETECTOR_SCHEMA,
  DETECTOR_SYSTEM,
  REPORT_SYSTEM,
  buildDetectorUser,
  buildReportUser
} from '@shared/prompts'
import type { LlmVerdict } from './questionDetector'

export interface StreamAnswerOptions {
  apiKey: string
  model: string
  system: string
  userText: string
  /** base64 PNG */
  image?: string
  mode: AnswerMode
  /** Coding and screenshot tasks get a little thinking even in fast mode. */
  needsReasoning: boolean
  signal: AbortSignal
  onDelta(text: string): void
}

let cached: { key: string; client: Anthropic } | null = null

function client(apiKey: string): Anthropic {
  if (!cached || cached.key !== apiKey) cached = { key: apiKey, client: new Anthropic({ apiKey }) }
  return cached.client
}

/** Haiku 4.5 takes neither adaptive thinking nor effort. */
function supportsEffort(model: string): boolean {
  return !model.startsWith('claude-haiku')
}

function reasoningParams(
  model: string,
  mode: AnswerMode,
  needsReasoning: boolean
): Pick<Anthropic.MessageStreamParams, 'thinking' | 'output_config'> {
  if (!supportsEffort(model)) return {}
  if (mode === 'thorough') return { thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } }
  if (needsReasoning) return { thinking: { type: 'adaptive' }, output_config: { effort: 'low' } }
  return { thinking: { type: 'disabled' }, output_config: { effort: 'low' } }
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Anthropic rejected the API key. Check it in Settings.'
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key cannot use the selected model.'
  if (err instanceof Anthropic.NotFoundError) return 'Model not found. Pick another model in Settings.'
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by Anthropic. Try again in a moment.'
  if (err instanceof Anthropic.BadRequestError) return `Request rejected: ${err.message}`
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach Anthropic. Check your connection.'
  if (err instanceof Anthropic.APIError) return `Anthropic error ${err.status ?? ''}: ${err.message}`
  return err instanceof Error ? err.message : String(err)
}

export async function streamAnswer(opts: StreamAnswerOptions): Promise<string> {
  const content: Anthropic.ContentBlockParam[] = []
  if (opts.image) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: opts.image } })
  }
  content.push({ type: 'text', text: opts.userText })

  const stream = client(opts.apiKey).messages.stream(
    {
      model: opts.model,
      max_tokens: opts.mode === 'thorough' || opts.needsReasoning ? 16000 : 4096,
      system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
      ...reasoningParams(opts.model, opts.mode, opts.needsReasoning)
    },
    { signal: opts.signal }
  )
  stream.on('text', (delta) => opts.onDelta(delta))
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') throw new Error('Claude declined to answer this one.')
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

export async function checkQuestion(
  apiKey: string,
  model: string,
  context: string,
  turn: string
): Promise<LlmVerdict | null> {
  const res = await client(apiKey).messages.create(
    {
      model,
      max_tokens: 400,
      system: DETECTOR_SYSTEM,
      messages: [{ role: 'user', content: buildDetectorUser(context, turn) }],
      output_config: { format: { type: 'json_schema', schema: DETECTOR_SCHEMA } }
    },
    { timeout: 10_000, maxRetries: 1 }
  )
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text
  if (!text) return null
  try {
    return JSON.parse(text) as LlmVerdict
  } catch {
    return null
  }
}

export async function generateReport(
  apiKey: string,
  model: string,
  transcript: string,
  questions: string[]
): Promise<string> {
  const stream = client(apiKey).messages.stream({
    model,
    max_tokens: 16000,
    system: REPORT_SYSTEM,
    messages: [{ role: 'user', content: buildReportUser(transcript, questions) }],
    ...(supportsEffort(model) ? { thinking: { type: 'adaptive' as const }, output_config: { effort: 'medium' as const } } : {})
  })
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') throw new Error('Claude declined to write this report.')
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

/** Returns an error message, or null when the key works. */
export async function testAnthropicKey(apiKey: string): Promise<string | null> {
  try {
    await new Anthropic({ apiKey, maxRetries: 0 }).models.list({ limit: 1 })
    return null
  } catch (err) {
    return describeError(err)
  }
}
