/**
 * Shrinks a photo in the browser before upload: longest side at most `max` px, re-encoded as JPEG.
 * Phone photos are often 4–12 MB; this keeps uploads around a few hundred KB.
 */
export async function shrinkPhoto(file: File, max = 2000): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not read that photo'))),
      'image/jpeg',
      0.85
    )
  )
}
