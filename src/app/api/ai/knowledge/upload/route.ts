import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadEmbeddingsKey } from '@/lib/ai/config'
import { ingestDocument } from '@/lib/ai/knowledge'
import { parseDocumentFile } from '@/lib/ai/document-parser'
import { AiError } from '@/lib/ai/types'

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

/**
 * POST /api/ai/knowledge/upload  (admin+)
 *
 * Upload and parse a document (PDF, Word, Excel, CSV, TXT) into the
 * knowledge base. Extracts raw text, saves a document row, and chunks
 * + indexes it for retrieval in conversational AI replies.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`ai-kb:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const formData = await request.formData().catch(() => null)
    if (!formData) {
      return NextResponse.json(
        { error: 'Multipart form data is required.' },
        { status: 400 },
      )
    }

    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'A valid document file is required.' },
        { status: 400 },
      )
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds maximum limit of 20MB.' },
        { status: 400 },
      )
    }

    const customTitle = (formData.get('title') as string | null)?.trim()

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let parsed
    try {
      parsed = await parseDocumentFile(buffer, file.name)
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : 'Failed to extract text from the document.',
        },
        { status: 400 },
      )
    }

    const title = customTitle || parsed.title
    const content = parsed.text

    // Insert into ai_knowledge_documents
    const { data: doc, error: insertError } = await supabase
      .from('ai_knowledge_documents')
      .insert({
        account_id: accountId,
        created_by: userId,
        title,
        content,
      })
      .select('id')
      .single()

    if (insertError || !doc) {
      console.error('[ai/knowledge/upload] insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to save document to database.' },
        { status: 500 },
      )
    }

    // Ingest chunks (and embeddings if key is present)
    const { key: embeddingsApiKey, corrupt } = await loadEmbeddingsKey(
      supabase,
      accountId,
    )

    let warning: string | undefined
    try {
      await ingestDocument(
        supabase,
        accountId,
        { embeddingsApiKey },
        doc.id,
        content,
      )
    } catch (err) {
      const msg = err instanceof AiError ? err.message : 'indexing error'
      console.warn('[ai/knowledge/upload] ingest warning:', err)
      warning = `Document saved, but semantic indexing failed (${msg}). Lexical keyword search is active.`
    }

    if (corrupt) {
      warning =
        'Document saved, but stored embeddings key could not be decrypted. Lexical search is active.'
    }

    return NextResponse.json({
      success: true,
      id: doc.id,
      title,
      charCount: content.length,
      format: parsed.format,
      warning,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
