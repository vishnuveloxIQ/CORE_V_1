/**
 * Builds a one-page PDF (Helvetica, A4) from plain text lines and returns it as a data URL.
 * Used for the sample offer letter format, so the demo has a real file to open.
 */
export function textPdfDataUrl(lines: string[]): string {
  // PDF strings: ASCII only, with ( ) \ escaped
  const safe = (t: string) => t.replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E]/g, '-').replace(/([\\()])/g, '\\$1')
  const body = ['BT', '/F1 11 Tf', '56 786 Td', '16 TL', ...lines.map((l) => `(${safe(l)}) Tj T*`), 'ET'].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return `data:application/pdf;base64,${btoa(out)}`
}

/** Approximate byte size of a base64 data URL. */
export const dataUrlBytes = (url: string) => Math.round(((url.split(',')[1] ?? '').length * 3) / 4)
