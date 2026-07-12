import {
  buildFiscalDeliveryMessage,
  type FiscalDeliveryPayload,
  type FiscalDeliveryProvider,
  type FiscalDeliveryResult,
} from './FiscalDeliveryProvider.interface'

const REQUEST_TIMEOUT_MS = 10_000

// Reuses the existing n8n + Meta Cloud API gateway: posts to an internal n8n webhook that sends
// the WhatsApp message. Keeps WhatsApp sending out of the API process (no direct Graph API call).
export class WhatsappN8nDeliveryProvider implements FiscalDeliveryProvider {
  readonly channel = 'whatsapp' as const

  async deliver(payload: FiscalDeliveryPayload): Promise<FiscalDeliveryResult> {
    const webhookUrl = process.env.N8N_FISCAL_WEBHOOK_URL
    if (!webhookUrl) return { ok: false, error: 'N8N_FISCAL_WEBHOOK_URL not configured' }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: payload.to,
          message: buildFiscalDeliveryMessage(payload),
          publicUrl: payload.publicUrl,
          chaveAcesso: payload.chaveAcesso,
        }),
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!response.ok) return { ok: false, error: `n8n webhook returned ${response.status}` }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'WhatsApp send failed' }
    }
  }
}
