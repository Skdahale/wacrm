import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateReply, parseGeneration } from './generate'
import { AiError, type AiConfig } from './types'

function config(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'sk-test',
    systemPrompt: null,
    isActive: true,
    autoReplyEnabled: false,
    autoReplyMaxPerConversation: 3,
    handoffAgentId: null,
    embeddingsApiKey: null,
    ...overrides,
  }
}

function okResponse(json: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => json,
  } as unknown as Response
}

function errResponse(status: number, json: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => json,
  } as unknown as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('parseGeneration', () => {
  it('returns text with no handoff', () => {
    expect(parseGeneration('Hello there')).toEqual({
      text: 'Hello there',
      handoff: false,
      usage: null,
    })
  })

  it('detects + strips the handoff sentinel', () => {
    expect(parseGeneration('[[HANDOFF]]')).toEqual({
      text: '',
      handoff: true,
      usage: null,
    })
    expect(parseGeneration('Let me get a human [[HANDOFF]]')).toEqual({
      text: 'Let me get a human',
      handoff: true,
      usage: null,
    })
  })

  it('passes usage straight through', () => {
    const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    expect(parseGeneration('Hi', usage)).toEqual({
      text: 'Hi',
      handoff: false,
      usage,
    })
  })
})

describe('generateReply — OpenAI', () => {
  it('calls the chat completions endpoint and returns the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        choices: [{ message: { content: 'Sure — happy to help!' } }],
        usage: { prompt_tokens: 42, completion_tokens: 8, total_tokens: 50 },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config({ provider: 'openai' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(res).toEqual({
      text: 'Sure — happy to help!',
      handoff: false,
      usage: { promptTokens: 42, completionTokens: 8, totalTokens: 50 },
    })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('api.openai.com')
    expect(opts.headers.Authorization).toBe('Bearer sk-test')
  })

  it('maps a 401 to an invalid_key AiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        errResponse(401, { error: { message: 'Incorrect API key' } }),
      ),
    )

    await expect(
      generateReply({
        config: config(),
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_key', status: 401 })
  })

  it('throws on an empty completion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ choices: [{ message: { content: '' } }] })),
    )
    await expect(
      generateReply({
        config: config(),
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toBeInstanceOf(AiError)
  })
})

describe('generateReply — Anthropic', () => {
  it('calls the messages endpoint with the version header and parses text blocks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        content: [{ type: 'text', text: 'Hi there!' }],
        usage: { input_tokens: 30, output_tokens: 6 },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config({ provider: 'anthropic', apiKey: 'sk-ant-x' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    // Anthropic reports input/output only — total is summed by normalizeUsage.
    expect(res).toEqual({
      text: 'Hi there!',
      handoff: false,
      usage: { promptTokens: 30, completionTokens: 6, totalTokens: 36 },
    })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('api.anthropic.com')
    expect(opts.headers['x-api-key']).toBe('sk-ant-x')
    expect(opts.headers['anthropic-version']).toBeTruthy()
  })

  it('detects handoff in the model output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse({ content: [{ type: 'text', text: '[[HANDOFF]]' }] }),
      ),
    )
    const res = await generateReply({
      config: config({ provider: 'anthropic' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'I want to speak to a person' }],
    })
    expect(res.handoff).toBe(true)
    expect(res.text).toBe('')
  })

  it('drops a leading assistant turn so the payload starts on the customer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ content: [{ type: 'text', text: 'ok' }] }))
    vi.stubGlobal('fetch', fetchMock)

    await generateReply({
      config: config({ provider: 'anthropic' }),
      systemPrompt: 'sys',
      messages: [
        { role: 'assistant', content: 'Welcome!' },
        { role: 'user', content: 'Hi' },
      ],
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages[0].role).toBe('user')
    expect(body.messages).toHaveLength(1)
  })
})

describe('generateReply — Gemini', () => {
  it('calls the generateContent endpoint with x-goog-api-key and parses text and usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello from Gemini!' }],
              role: 'model',
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 25,
          candidatesTokenCount: 7,
          totalTokenCount: 32,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'AIzaSy-test' }),
      systemPrompt: 'You are an assistant',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    expect(res).toEqual({
      text: 'Hello from Gemini!',
      handoff: false,
      usage: { promptTokens: 25, completionTokens: 7, totalTokens: 32 },
    })

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('generativelanguage.googleapis.com')
    expect(url).toContain('gemini-2.5-flash:generateContent')
    expect(opts.headers['x-goog-api-key']).toBe('AIzaSy-test')

    const body = JSON.parse(opts.body)
    expect(body.systemInstruction.parts[0].text).toBe('You are an assistant')
    expect(body.contents[0].role).toBe('user')
    expect(body.contents[0].parts[0].text).toBe('Hello')
  })

  it('detects handoff in Gemini output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse({
          candidates: [
            {
              content: {
                parts: [{ text: 'Please wait while I connect you [[HANDOFF]]' }],
                role: 'model',
              },
            },
          ],
        }),
      ),
    )
    const res = await generateReply({
      config: config({ provider: 'gemini' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Agent please' }],
    })
    expect(res.handoff).toBe(true)
    expect(res.text).toBe('Please wait while I connect you')
  })

  it('maps assistant roles to model and merges consecutive messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        candidates: [
          {
            content: { parts: [{ text: 'Response' }], role: 'model' },
          },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await generateReply({
      config: config({ provider: 'gemini' }),
      systemPrompt: 'sys',
      messages: [
        { role: 'assistant', content: 'Greeting' },
        { role: 'user', content: 'Hi 1' },
        { role: 'user', content: 'Hi 2' },
        { role: 'assistant', content: 'How can I help?' },
        { role: 'user', content: 'Need info' },
      ],
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    // Leading assistant greeting is dropped so it starts with user
    expect(body.contents[0].role).toBe('user')
    expect(body.contents[0].parts[0].text).toContain('Hi 1\n\nHi 2')
    expect(body.contents[1].role).toBe('model')
    expect(body.contents[1].parts[0].text).toBe('How can I help?')
    expect(body.contents[2].role).toBe('user')
    expect(body.contents[2].parts[0].text).toBe('Need info')
  })
})
