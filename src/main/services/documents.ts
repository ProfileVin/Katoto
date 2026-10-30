import fs from 'fs/promises'
import path from 'path'
import mammoth from 'mammoth'
import { extractText, getDocumentProxy } from 'unpdf'

const MAX_CHARS = 60_000

export const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt', 'md']

/** Extracts plain text from a resume / job description file. */
export async function extractDocumentText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  let text: string
  if (ext === 'pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(await fs.readFile(filePath)))
    text = (await extractText(pdf, { mergePages: true })).text
  } else if (ext === 'docx') {
    text = (await mammoth.extractRawText({ path: filePath })).value
  } else if (ext === 'txt' || ext === 'md') {
    text = await fs.readFile(filePath, 'utf8')
  } else {
    throw new Error(`Unsupported file type .${ext}. Use PDF, DOCX, TXT or MD.`)
  }
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!text) throw new Error('No text found in that file. If it is a scanned PDF, paste the text instead.')
  return text.slice(0, MAX_CHARS)
}
