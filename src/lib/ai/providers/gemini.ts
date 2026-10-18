import { AiError, type ChatMessage, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiPart {
  text?: string
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[]
    role?: string
  }
  finishReason?: string
}

interface GeminiUsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
  promptFeedback?: {
    blockReason?: string
  }
  usageMetadata?: GeminiUsageMetadata
}

/**
 * Gemini's API expects alternating turns starting with 'user'.
 * Merge consecutive turns, then drop any leading assistant (model)
 * turns so the transcript starts with user input.
 */
function normalizeForGemini(messages: ChatMessage[]): ChatMessage[] {
  const merged = mergeConsecutive(messages)
  while (merged.length > 0 && merged[0].role === 'assistant') {
    merged.shift()
  }
  if (merged.length === 0) {
    return [{ role: 'user', content: '(The customer has not sent a message yet.)' }]
  }
  return merged
}

/**
 * Call Google's Gemini generateContent endpoint with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens
 * in `generateReply`).
 */
export async function generateGemini(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args

  // Clean model ID in case the user specified 'models/gemini-2.5-flash'
  const cleanModel = model.replace(/^models\//, '')
  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(cleanModel)}:generateContent`

  const contents = normalizeForGemini(messages).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  }

  if (systemPrompt && systemPrompt.trim()) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }],
    }
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('Gemini', res)
  }

  const data = (await res.json().catch(() => null)) as GeminiResponse | null
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((b) => b.text)
    .filter((t): t is string => typeof t === 'string')
    .join('')
    .trim()

  if (!text) {
    const finishReason = data?.candidates?.[0]?.finishReason
    const blockReason = data?.promptFeedback?.blockReason
    const reason = blockReason || finishReason
    throw new AiError(
      reason
        ? `Gemini returned an empty response (${reason}).`
        : 'Gemini returned an empty response.',
      {
        code: 'empty_response',
      },
    )
  }

  const usage = normalizeUsage({
    prompt: data?.usageMetadata?.promptTokenCount,
    completion: data?.usageMetadata?.candidatesTokenCount,
    total: data?.usageMetadata?.totalTokenCount,
  })

  return { text, usage }
}
