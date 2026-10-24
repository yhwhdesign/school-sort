import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/**
 * Text extraction for uploaded PDFs. Runs in the browser, so a school notice or
 * a lease never leaves the user's device. The worker is bundled by Vite rather
 * than loaded from a CDN.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(
      content.items.map((item) => ('str' in item ? item.str : ' ')).join(' '),
    )
  }

  return pages.join('\n')
}
