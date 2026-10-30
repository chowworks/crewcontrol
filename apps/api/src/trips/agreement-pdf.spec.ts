import { agreementPdf } from './agreement-pdf'

it('makes a PDF of a signed agreement', async () => {
  const pdf = await agreementPdf({
    tripName: 'Simone’s 40th in Tulum',
    text: 'Trip agreement\n\nThe guest pays $1,200 → in three payments, −$50 credit.',
    typedName: 'Dana Reyes',
    signedAt: new Date('2026-10-21T15:04:00Z'),
    templateVersion: '2026-10-29.4',
    textHash: 'a'.repeat(64),
  })
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdf.length).toBeGreaterThan(1000)
})
