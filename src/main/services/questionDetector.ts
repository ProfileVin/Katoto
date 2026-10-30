import type { QuestionType } from '@shared/types'

export type Verdict = 'yes' | 'maybe' | 'no'

export interface HeuristicResult {
  verdict: Verdict
  /** The part of the turn that holds the question (empty when verdict is 'no'). */
  question: string
  type: QuestionType
}

export interface LlmVerdict {
  is_question: boolean
  question: string
  type: QuestionType
}

export interface DetectedResult {
  text: string
  type: QuestionType
  source: 'heuristic' | 'llm'
}

// Multi-word prompts that are requests for an answer wherever they appear.
const STRONG_PROMPT =
  /\b(tell me (about|how|why|what|more)|walk (me|us) through|talk (me|us) through|give (me|us) an example|share an example|share a time|how would you|what would you|why would you|how do you|how did you|why did you|why do you|what do you think|have you ever|what's your|what is your|what are your|can you (tell|explain|walk|describe|give|share|write|design|implement|talk|think|elaborate|go over)|could you (tell|explain|walk|describe|give|share|write|design|implement|talk|elaborate|go over)|i('d| would) (like|love|want) you to|what happens (when|if))\b/i

// Single-verb imperatives only count at the start of a sentence (after an optional filler).
const IMPERATIVE_START =
  /^(so,?|okay,?|ok,?|alright,?|all right,?|and|now,?|great,?|cool,?|next,?|then,?)?\s*(describe|explain|design|implement|write|define|compare|name|list|walk|solve|estimate)\b/i

const INTERROGATIVE_START =
  /^(so,?|okay,?|ok,?|alright,?|and|now,?)?\s*(what|why|how|when|where|which|who|whose|is|are|was|were|do|does|did|have|has|can|could|would|will|should)\b/i

const SOFT_PROMPT =
  /\b(i('d| would) (like|love) to (hear|know|understand)|i'm curious|i am curious|let's say|suppose|imagine|let's talk about|let's move on to|next question|how about|thoughts on)\b/i

const TYPE_RULES: [QuestionType, RegExp][] = [
  [
    'coding',
    /\b(write (a|an|the|some)? ?(function|method|program|query|code|class|algorithm)|implement|leetcode|array|linked list|binary tree|hash ?map|string|integer|return the|time complexity|space complexity|big o|o\(n|recursion|sort(ed)?|two pointers|dynamic programming|sql query)\b/i
  ],
  [
    'system_design',
    /\b(design (a|an|the)|system design|architect(ure)?|scal(e|ability|ing)|million users|high availability|load balanc|sharding|distributed|microservice|rate limiter|url shortener|throughput|latency)\b/i
  ],
  [
    'behavioral',
    /\b(tell me about (a|an) (time|situation|project|moment)|describe a (time|situation)|give (me|us) an example of|conflict|disagree|challenge|mistake|failure|failed|proud|strength|weakness|feedback|difficult|deadline|lead(ership)?|teammate|stakeholder|why (do you want|are you interested|this (role|company))|tell me about yourself|where do you see yourself)\b/i
  ],
  [
    'technical',
    /\b(difference between|what is (a|an)|how does|explain|api|database|cache|thread|process|memory|react|javascript|typescript|python|java|kubernetes|docker|cloud|aws|http|rest|graphql|index|transaction|concurrency|protocol|framework|testing)\b/i
  ]
]

export function guessType(text: string): QuestionType {
  for (const [type, re] of TYPE_RULES) if (re.test(text)) return type
  return 'other'
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Fast local check on an interviewer turn. 'yes' answers immediately,
 * 'maybe' is sent to the LLM to decide, 'no' is dropped.
 */
export function classifyHeuristic(turn: string): HeuristicResult {
  const sentences = splitSentences(turn)
  const none: HeuristicResult = { verdict: 'no', question: '', type: 'other' }
  if (wordCount(turn) < 3) return none

  // Only the tail of a long monologue matters: the question usually comes last.
  const tail = sentences.slice(-3)
  const offset = sentences.length - tail.length

  const strongIdx = tail.findIndex(
    (s) => /\?$/.test(s) || STRONG_PROMPT.test(s) || IMPERATIVE_START.test(s)
  )
  if (strongIdx >= 0) {
    // Short follow-ups lean on the sentence before them
    // ("Given an array of ints, find two that sum to k. Can you walk me through your approach?").
    let start = offset + strongIdx
    if (start > 0 && wordCount(sentences[start]) < 12) start -= 1
    const question = sentences.slice(start).join(' ')
    return { verdict: 'yes', question, type: guessType(question) }
  }

  const softIdx = tail.findIndex((s) => INTERROGATIVE_START.test(s) || SOFT_PROMPT.test(s))
  if (softIdx >= 0) {
    const question = sentences.slice(offset + softIdx).join(' ')
    return { verdict: 'maybe', question, type: guessType(question) }
  }
  return none
}

function normalize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  )
}

/** True when `question` is essentially the same as one of the recent ones. */
export function isDuplicate(question: string, recent: string[]): boolean {
  const a = normalize(question)
  if (a.size === 0) return true
  return recent.some((r) => {
    const b = normalize(r)
    let shared = 0
    for (const w of a) if (b.has(w)) shared++
    const union = a.size + b.size - shared
    return union > 0 && shared / union >= 0.8
  })
}

export type LlmCheck = (context: string, turn: string) => Promise<LlmVerdict | null>

export class QuestionDetector {
  private recent: string[] = []

  constructor(private readonly llmCheck: LlmCheck) {}

  reset(): void {
    this.recent = []
  }

  async evaluate(turn: string, context: string): Promise<DetectedResult | null> {
    const h = classifyHeuristic(turn)
    let result: DetectedResult | null = null

    if (h.verdict === 'yes') {
      result = { text: h.question, type: h.type, source: 'heuristic' }
    } else if (h.verdict === 'maybe') {
      const v = await this.llmCheck(context, turn)
      if (v?.is_question && v.question.trim()) {
        result = { text: v.question.trim(), type: v.type, source: 'llm' }
      }
    }

    if (!result || isDuplicate(result.text, this.recent)) return null
    this.recent = [...this.recent, result.text].slice(-5)
    return result
  }
}
