import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
// @ts-expect-error - pdf-parse lacks type declarations for its internal lib entrypoint
import pdfParse from 'pdf-parse/lib/pdf-parse.js'

export interface ParsedDocument {
  text: string
  title: string
  format: string
}

/**
 * Extract clean, structured text from uploaded documents (PDF, Word, Excel, CSV, TXT).
 */
export async function parseDocumentFile(
  buffer: Buffer,
  filename: string,
): Promise<ParsedDocument> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  let text = ''
  let format = ext.toUpperCase()

  if (ext === 'pdf') {
    format = 'PDF'
    const pdfData = await pdfParse(buffer)
    text = pdfData.text || ''
  } else if (ext === 'docx' || ext === 'doc') {
    format = 'DOCX'
    const docData = await mammoth.extractRawText({ buffer })
    text = docData.value || ''
  } else if (ext === 'xlsx' || ext === 'xls') {
    format = 'EXCEL'
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetTexts: string[] = []
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) continue
      const csv = XLSX.utils.sheet_to_csv(sheet)
      if (csv.trim()) {
        sheetTexts.push(`### Sheet: ${sheetName}\n${csv.trim()}`)
      }
    }
    text = sheetTexts.join('\n\n')
  } else if (ext === 'csv') {
    format = 'CSV'
    text = buffer.toString('utf-8')
  } else if (ext === 'txt' || ext === 'md') {
    format = 'TXT'
    text = buffer.toString('utf-8')
  } else {
    throw new Error(
      `Unsupported file type ".${ext}". Please upload a PDF (.pdf), Word document (.docx), Excel spreadsheet (.xlsx, .xls), CSV (.csv), or Text file (.txt).`,
    )
  }

  // Clean and normalize extracted text:
  // - normalize line endings to \n
  // - collapse excess blank lines (max 2 consecutive newlines)
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!cleaned || cleaned.length < 5) {
    throw new Error(
      'No readable text could be extracted from this document. If it is a scanned image, please convert to text first.',
    )
  }

  // Generate suggested title by stripping extension and replacing underscores/dashes with spaces
  const baseTitle = filename.replace(/\.[^/.]+$/, '').trim()
  const cleanTitle = baseTitle.replace(/[_-]+/g, ' ').trim() || filename

  return {
    text: cleaned,
    title: cleanTitle,
    format,
  }
}
