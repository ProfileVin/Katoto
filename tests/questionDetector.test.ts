import { describe, expect, it, vi } from 'vitest'
import {
  QuestionDetector,
  classifyHeuristic,
  guessType,
  isDuplicate,
  splitSentences
} from '../src/main/services/questionDetector'

describe('classifyHeuristic', () => {
  it.each([
    'Tell me about a time you disagreed with your manager.',
    "So what's your experience with Kubernetes?",
    'Walk me through how you would design a URL shortener.',
    'Describe your most challenging project.',
    'Can you explain the difference between a process and a thread.',
    'Have you ever had to deal with a production outage'
  ])('flags %j as a question', (turn) => {
    expect(classifyHeuristic(turn).verdict).toBe('yes')
  })

  it.each(['Great, thanks.', 'Okay.', 'That makes sense, I like that answer a lot.', 'We are a team of about forty engineers in Berlin.'])(
    'ignores %j',
    (turn) => {
      expect(classifyHeuristic(turn).verdict).toBe('no')
    }
  )

  it.each(['How we work here is pretty collaborative.', "I'd love to hear about your biggest project."])(
    'sends %j to the LLM',
    (turn) => {
      expect(classifyHeuristic(turn).verdict).toBe('maybe')
    }
  )

  it('keeps the setup sentence of a short follow-up question', () => {
    const r = classifyHeuristic(
      'Given an array of integers, return the indices of two numbers that add up to a target. Can you walk me through your approach?'
    )
    expect(r.verdict).toBe('yes')
    expect(r.question).toMatch(/^Given an array/)
    expect(r.type).toBe('coding')
  })

  it('only looks at the end of a long monologue', () => {
    const r = classifyHeuristic(
      'Thanks for joining. So a bit about us. We build payments infrastructure. The team is growing fast. We care a lot about ownership. Why do you want to work here?'
    )
    expect(r.verdict).toBe('yes')
    expect(r.question).toContain('Why do you want to work here?')
    expect(r.question).not.toContain('Thanks for joining')
    expect(r.type).toBe('behavioral')
  })
})

describe('guessType', () => {
  it('classifies common interview questions', () => {
    expect(guessType('How would you design a rate limiter for a million users?')).toBe('system_design')
    expect(guessType('Write a function that reverses a linked list.')).toBe('coding')
    expect(guessType('Tell me about a time you failed.')).toBe('behavioral')
    expect(guessType('What is the difference between REST and GraphQL?')).toBe('technical')
    expect(guessType('Where are you based?')).toBe('other')
  })
})

describe('splitSentences', () => {
  it('splits on terminal punctuation', () => {
    expect(splitSentences('Hi there. How are you?  Good!')).toEqual(['Hi there.', 'How are you?', 'Good!'])
  })
})

describe('isDuplicate', () => {
  it('matches near-identical questions', () => {
    expect(isDuplicate('What is your biggest weakness?', ['what is your biggest weakness'])).toBe(true)
    expect(isDuplicate('What is your biggest strength?', ['What is your biggest weakness?'])).toBe(false)
  })
})

describe('QuestionDetector', () => {
  it('answers clear questions without calling the LLM', async () => {
    const llm = vi.fn()
    const d = new QuestionDetector(llm)
    const r = await d.evaluate('Tell me about yourself.', '')
    expect(r).toMatchObject({ source: 'heuristic', type: 'behavioral' })
    expect(llm).not.toHaveBeenCalled()
  })

  it('asks the LLM about ambiguous turns and uses its rewrite', async () => {
    const llm = vi.fn().mockResolvedValue({ is_question: true, question: 'How do you work with your team?', type: 'behavioral' })
    const d = new QuestionDetector(llm)
    const r = await d.evaluate('How you work with your team is something I am curious about.', 'ctx')
    expect(llm).toHaveBeenCalledWith('ctx', 'How you work with your team is something I am curious about.')
    expect(r).toEqual({ text: 'How do you work with your team?', type: 'behavioral', source: 'llm' })
  })

  it('drops turns the LLM rejects', async () => {
    const d = new QuestionDetector(vi.fn().mockResolvedValue({ is_question: false, question: '', type: 'other' }))
    expect(await d.evaluate('How we work here is pretty collaborative.', '')).toBeNull()
  })

  it('suppresses repeats until reset', async () => {
    const d = new QuestionDetector(vi.fn())
    expect(await d.evaluate('What is your biggest weakness?', '')).not.toBeNull()
    expect(await d.evaluate('What is your biggest weakness?', '')).toBeNull()
    d.reset()
    expect(await d.evaluate('What is your biggest weakness?', '')).not.toBeNull()
  })
})
