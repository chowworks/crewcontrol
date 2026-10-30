// pdfkit is a CommonJS module that exports its class itself, so it is imported the TypeScript way for that.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit')

/** A signed agreement and how it was signed, as AgreementSignature keeps it. */
export interface SignedCopy {
  tripName: string
  text: string
  typedName: string
  signedAt: Date
  templateVersion: string
  textHash: string
}

// The characters the PDF's built-in fonts can draw beyond Latin-1; anything else is written another way.
const EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
const plain = (s: string) =>
  s
    .replace(/\u2212/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/[\u2009\u202f\u00a0]/g, ' ')
    .replace(/./gu, (c) => (c.charCodeAt(0) <= 0xff || EXTRA.has(c) ? c : '?'))

/**
 * A guest's signed trip agreement as a PDF, for the email they get when their trip is deleted (issue #2): the text
 * exactly as they signed it, then who signed, when, the agreement's version and the SHA-256 of its text.
 */
export function agreementPdf(copy: SignedCopy): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 64,
      info: { Title: plain(`Signed trip agreement: ${copy.tripName}`), Author: 'Travel HQ' },
    })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0F1C2E').text('Signed trip agreement')
    doc.font('Helvetica').fontSize(12).fillColor('#4A5568').text(plain(copy.tripName))
    doc.moveDown()
    doc.font('Helvetica').fontSize(10.5).fillColor('#0F1C2E')
    doc.text(plain(copy.text), { lineGap: 2, paragraphGap: 4 })
    doc.moveDown(1.5)
    doc.font('Helvetica-Bold').fontSize(11).text('Signature')
    doc.font('Helvetica').fontSize(10.5)
    doc.text(plain(`Signed by: ${copy.typedName}`))
    doc.text(`Signed at: ${copy.signedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`)
    doc.text(plain(`Agreement version: ${copy.templateVersion}`))
    doc.text(`SHA-256 of the agreement text: ${copy.textHash}`)
    doc.end()
  })
}
