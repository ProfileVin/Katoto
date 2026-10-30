import type { AnswerKind, Profile, QuestionType, TranscriptSegment } from './types'

/**
 * Stable system prompt. It must not contain anything that changes per request
 * (time, ids, transcript) so the profile part stays prompt-cacheable.
 */
export function buildSystemPrompt(profile: Profile | null): string {
  const base = `You are Katoto, a real-time interview copilot. The user is a job candidate in a live interview. You get a live transcript of the call, with "Interviewer:" and "Me:" lines, and sometimes a screenshot of the candidate's screen. Your answer appears in a small overlay the candidate glances at while speaking, so it must be scannable in a few seconds.

How to answer:
- Lead with the answer. No preamble, no restating the question, no "Great question".
- Write in the first person, as the candidate would say it out loud: natural, confident, spoken English.
- Default shape: one bold line with the core answer, then 2-4 short bullet talking points. Add more only when the question needs it.
- Behavioral questions: a STAR story as four short bullets (Situation, Task, Action, Result) drawn from the candidate's resume, quantified where the resume supports it. Never invent employers, titles, projects or numbers the resume does not support. If the resume has nothing relevant, give a sensible framing and mark details the candidate must fill in with [brackets].
- Technical and conceptual questions: a crisp definition or direct answer first, then the key points, trade-offs and one concrete example.
- Coding questions: one or two lines on the approach, then clean, correct code in a fenced block (use the language the interviewer named, otherwise Python), then time and space complexity, then one or two edge cases worth mentioning.
- System design questions: terse bullets covering requirements to clarify, core components, data model, the main scaling bottleneck and key trade-offs.
- The transcript comes from speech recognition and may contain misheard words. Answer the most likely intended question and do not comment on transcription quality.
- Keep the candidate honest and credible: sound like an experienced professional, not a textbook.`

  if (!profile) return base

  const sections: string[] = [base, '', 'Context about the candidate and the role:']
  if (profile.resume.trim()) sections.push(`<resume>\n${profile.resume.trim()}\n</resume>`)
  if (profile.jobDescription.trim())
    sections.push(`<job_description>\n${profile.jobDescription.trim()}\n</job_description>`)
  if (profile.company.trim()) sections.push(`<company_notes>\n${profile.company.trim()}\n</company_notes>`)
  if (profile.instructions.trim())
    sections.push(
      `<candidate_instructions>\nThe candidate asked you to follow these preferences:\n${profile.instructions.trim()}\n</candidate_instructions>`
    )
  return sections.join('\n\n')
}

const MAX_TRANSCRIPT_CHARS = 12000

export function formatTranscript(segments: TranscriptSegment[], startedAt?: number): string {
  const origin = startedAt ?? segments[0]?.ts ?? 0
  const lines = segments
    .filter((s) => s.text.trim())
    .map((s) => {
      const sec = Math.max(0, Math.round((s.ts - origin) / 1000))
      const stamp = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
      return `[${stamp}] ${s.speaker === 'interviewer' ? 'Interviewer' : 'Me'}: ${s.text.trim()}`
    })

  // Keep the most recent lines that fit the budget.
  const kept: string[] = []
  let total = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    total += lines[i].length + 1
    if (total > MAX_TRANSCRIPT_CHARS) break
    kept.unshift(lines[i])
  }
  return kept.join('\n')
}

export interface TaskInput {
  kind: AnswerKind
  question?: string
  questionType?: QuestionType
  askText?: string
  previousAnswer?: string
  hasScreenshot?: boolean
}

export function buildTask(input: TaskInput): string {
  switch (input.kind) {
    case 'question':
      return `The interviewer just asked: "${input.question}"${
        input.questionType && input.questionType !== 'other' ? ` (looks like a ${input.questionType.replace('_', ' ')} question)` : ''
      }. Tell me what to say.`
    case 'assist':
      return `Tell me what to say next. If the interviewer's latest turn asks or implies a question, answer it. If nothing is pending, give me a useful point to add to the current topic.${
        input.hasScreenshot ? ' A screenshot of my screen is attached; use it if it is relevant.' : ''
      }`
    case 'screenshot':
      return 'The attached screenshot is my screen right now. Identify the problem or question shown on it (a coding problem, a multiple-choice or written question, a system design prompt, an error, a diagram) and solve it. If it is a coding problem, give the approach, working code, complexity and edge cases. If nothing on screen is a question, briefly say what is there and what I could say about it.'
    case 'ask':
      return `My question: ${input.askText}`
    case 'followups':
      return 'Suggest 3 sharp, specific questions I could ask the interviewer now, based on the conversation, the role and the company. One line each, as a numbered list, no explanations.'
    case 'recap':
      return 'Recap the conversation so far in 3-5 bullets: topics covered, what the interviewer seems to care about, and anything I promised to follow up on.'
    case 'shorter':
      return `Rewrite this answer much shorter: at most 3 bullets I can say out loud. Keep any code block but trim everything else.\n\n<answer>\n${input.previousAnswer}\n</answer>`
  }
}

export function buildUserText(transcript: string, task: string): string {
  const convo = transcript.trim() ? `<transcript>\n${transcript}\n</transcript>` : '<transcript>(no conversation captured yet)</transcript>'
  return `${convo}\n\n${task}`
}

export const DETECTOR_SYSTEM = `You read the latest turn from an interviewer in a live job interview transcript (from speech recognition, so expect misheard words and missing punctuation) and decide whether the candidate is now expected to answer something.

A question includes direct questions, and prompts phrased as statements or requests ("tell me about...", "walk me through...", "I'd love to hear how you...", "let's say you have an array..."). Small talk that expects a reply ("how are you doing today") counts only if a real answer is needed; greetings, acknowledgements ("great, thanks"), and the interviewer describing the company or the process do not count.

If it is a question, rewrite it as one clean, self-contained question, fixing obvious recognition errors. Classify its type.`

export const DETECTOR_SCHEMA = {
  type: 'object',
  properties: {
    is_question: { type: 'boolean' },
    question: { type: 'string', description: 'Clean self-contained question, or empty string' },
    type: { type: 'string', enum: ['behavioral', 'technical', 'coding', 'system_design', 'other'] }
  },
  required: ['is_question', 'question', 'type'],
  additionalProperties: false
} as const

export function buildDetectorUser(context: string, latestTurn: string): string {
  return `<recent_transcript>\n${context || '(none)'}\n</recent_transcript>\n\n<latest_interviewer_turn>\n${latestTurn}\n</latest_interviewer_turn>`
}

export const REPORT_SYSTEM = `You are an interview coach reviewing the transcript of a job interview the user (the candidate, "Me") just finished. Transcripts come from speech recognition and may contain errors. Be specific and honest, cite what was actually said, and keep it practical.`

export function buildReportUser(transcript: string, questions: string[]): string {
  return `<transcript>\n${transcript || '(empty)'}\n</transcript>

<detected_questions>
${questions.length ? questions.map((q, i) => `${i + 1}. ${q}`).join('\n') : '(none detected)'}
</detected_questions>

Write a post-interview report in Markdown with these sections:
## Summary
Two or three sentences on how the interview went and what the role seems to need.
## Questions asked
For each question: the question in bold, then one or two lines on how I answered and a concrete way to answer it better.
## Strengths
## Improve next time
## Follow-ups
Anything I promised, anything worth sending in a thank-you note, and questions to prepare for the next round.`
}
