import { BillingWorkflowError } from './workflows.ts'
export async function billingBody(request: Request, max = 4096): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader()
  if (!reader) throw new BillingWorkflowError('INVALID_BODY', 'A JSON request is required.', 400)
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) { await reader.cancel(); throw new BillingWorkflowError('BODY_LIMIT', 'Request is too large.', 413) }
    chunks.push(value)
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body')
    return body
  } catch { throw new BillingWorkflowError('INVALID_BODY', 'A valid JSON request is required.', 400) }
}
