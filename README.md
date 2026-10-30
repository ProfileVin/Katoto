# Katoto

A real-time AI interview copilot for Windows, A small always-on-top overlay listens to your call, transcribes both sides, notices when the interviewer asks a question, and streams a suggested answer from Claude. It also solves whatever is on your screen, and keeps a history of every session with a post-call report.

## Features

- **Live call transcription.** It captures system audio (the interviewer, from any meeting app) and your microphone as separate channels, so the transcript is labeled *Interviewer* / *You*. Transcription is Deepgram `nova-3` streaming.
- **Automatic question detection.** A local heuristic catches clear questions instantly. Ambiguous turns ("I'd love to hear about…") are checked by Claude Haiku 4.5.
- **Instant answers.** Claude Sonnet 5 streams a scannable answer, using your resume, the job description and the recent conversation:
  - behavioral questions get STAR bullets
  - coding questions get approach, code, complexity and edge cases
  - system design questions get terse design bullets
- **What should I say?** (Ctrl+Enter) answers from the conversation so far. If nothing has been said yet, it reads your screen instead.
- **Screenshot & solve** (Ctrl+Shift+S): Claude reads the screen under your cursor (e.g. a LeetCode problem) and solves it.
- **Ask box and quick actions**: type any question; also *Questions to ask them*, *Recap*, *Shorter*.
- **Overlay controls**: frameless, translucent, always on top, not in the taskbar. It has hotkeys, an opacity setting and click-through mode, and it lives in the tray.
- **Hidden from screen share** (on by default): the overlay and dashboard are excluded from screen shares and recordings via `SetWindowDisplayAffinity`.
- **Profiles**: resume (import PDF/DOCX/TXT), job description, company notes and custom instructions. The active profile is sent with every answer (prompt-cached).
- **History and reports**: every session is saved with its transcript, detected questions and answers. One click generates a coaching report.

## Setup

Requirements: Windows 10 2004+ (Windows 11 recommended), Node.js 20+.

```bash
npm install
npm run dev
```

On first launch the dashboard opens. Add:

- an **Anthropic API key**, from [console.anthropic.com](https://console.anthropic.com/settings/keys)
- a **Deepgram API key**, from [console.deepgram.com](https://console.deepgram.com) (new accounts include free credit)

Keys are encrypted with Windows DPAPI (`safeStorage`) and never leave the main process.

Then create a **profile** with your resume and the job description, and press **Listen** (Ctrl+Shift+L) when the call starts.

> Use headphones. Otherwise your microphone also picks up the interviewer, and their words show up twice in the transcript (they never trigger answers from the mic channel, though).

> Running `npm run dev` from a process that sets `ELECTRON_RUN_AS_NODE=1` (some editor extension hosts do) makes Electron start as plain Node. Unset it first.

## Hotkeys

| Action | Keys |
|---|---|
| Show / hide overlay | Ctrl+\ |
| Start / stop listening | Ctrl+Shift+L |
| What should I say? | Ctrl+Enter |
| Screenshot & solve | Ctrl+Shift+S |
| Type a question | Ctrl+Shift+Space |
| Toggle click-through | Ctrl+Shift+M |
| Open dashboard | Ctrl+Shift+D |
| Move overlay | Ctrl+Alt+Arrows |
| Clear answers (overlay focused) | Ctrl+R |
| Stop the current answer (overlay focused) | Esc |

These are global shortcuts, so while Katoto runs they take over those key combinations in other apps too (e.g. Ctrl+Enter in chat apps).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run with hot reload |
| `npm test` | Unit tests (question detector, transcript assembly, PCM encoding) |
| `npm run typecheck` | TypeScript check for main, preload and renderer |
| `npm run build` | Typecheck and bundle to `out/` |
| `npm run build:win` | Build a Windows installer into `dist/` |

## How it works

```
Overlay renderer                                  Main process
 getDisplayMedia (loopback audio) ─┐               DeepgramStream  (wss, multichannel=2)
 getUserMedia (mic) ───────────────┤                 └ TranscriptAssembler → utterances
 AudioWorklet → 16 kHz stereo PCM ─┴── IPC ───────▶ QuestionDetector (heuristic → Haiku)
                                                    Claude answers (Sonnet, streaming, vision)
 ◀── transcript / question / answer deltas ───────  Sessions (JSON in %APPDATA%\Katoto)
```

- `src/main/copilot.ts` is the orchestrator. It owns the listening session and turns interviewer utterances into questions, and questions into streamed answers.
- `src/main/services/`:
  - `deepgram.ts`: streaming socket with keep-alive and reconnect
  - `transcript.ts`: interim/final results merged into utterances
  - `questionDetector.ts`: question heuristics and deduplication
  - `claude.ts`: all Anthropic calls
  - `store.ts`: settings, encrypted keys, profiles
  - `sessions.ts`: session history
- `src/shared/prompts.ts` holds every prompt. The system prompt holds only the stable profile, so it caches across questions.
- `src/renderer/src/overlay/` is the overlay UI and audio capture. `src/renderer/src/dashboard/` is setup, profiles and history.

Data lives in `%APPDATA%\Katoto\`: `settings.json`, `keys.json`, `profiles.json`, `sessions\*.json`.

## A note on use

Hiding the overlay from screen share is a feature, not permission. Many employers, schools and exam proctors prohibit AI assistance during interviews or tests. Check the rules of the conversation you are in.
