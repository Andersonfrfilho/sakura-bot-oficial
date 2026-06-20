import { timingSafeEqual, createHmac } from 'crypto'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import type { FindOrCreateCustomerUseCase } from '@/modules/customers/application/use-cases/FindOrCreateCustomerUseCase'
import type { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'
import { UnauthorizedError, ConflictError } from '@/shared/errors/AppError'

const WEBHOOK_SECRET = process.env.WEBHOOK_VERIFY_TOKEN ?? 'change-webhook-secret'
const NONCE_TTL_SECONDS = 300 // 5-minute replay window

// Meta sends X-Hub-Signature-256: sha256=<hex>
function verifyHmac(rawBody: Buffer, signature: string): boolean {
  if (!signature.startsWith('sha256=')) return false
  const expected = Buffer.from(signature.slice(7), 'hex')
  const actual = Buffer.from(
    createHmac('sha256', process.env.WHATSAPP_ACCESS_TOKEN ?? WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex'),
    'hex'
  )
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

interface WhatsAppEntry {
  id: string
  changes: Array<{
    value: {
      messaging_product: string
      metadata?: { display_phone_number: string; phone_number_id: string }
      messages?: Array<{
        id: string
        from: string
        type: string
        text?: { body: string }
        interactive?: { type: string; button_reply?: { id: string; title: string } }
        timestamp: string
      }>
    }
  }>
}

interface WebhookPayload {
  object: string
  entry: WhatsAppEntry[]
}

interface ReceiveInput {
  establishmentId: string
  rawBody: Buffer
  signature: string
  nonce: string
  payload: WebhookPayload
}

export class ReceiveWhatsAppWebhookUseCase {
  constructor(
    private readonly cache: CacheProvider,
    private readonly findOrCreateCustomerUseCase: FindOrCreateCustomerUseCase,
    private readonly createAuditLogUseCase: CreateAuditLogUseCase
  ) {}

  async execute(input: ReceiveInput): Promise<void> {
    // HMAC verification
    if (!verifyHmac(input.rawBody, input.signature)) {
      throw new UnauthorizedError('invalid_webhook_signature')
    }

    // Replay protection via nonce
    const nonceKey = `webhook:nonce:${input.nonce}`
    const nonceExists = await this.cache.exists(nonceKey)
    if (nonceExists) {
      throw new ConflictError('Duplicate webhook delivery')
    }
    await this.cache.set(nonceKey, '1', NONCE_TTL_SECONDS)

    // Process each message in the webhook
    for (const entry of input.payload.entry) {
      for (const change of entry.changes) {
        const messages = change.value.messages ?? []
        for (const message of messages) {
          await this.processMessage(input.establishmentId, message)
        }
      }
    }

    await this.createAuditLogUseCase.execute({
      establishmentId: input.establishmentId,
      action: 'webhook.received',
      resourceType: 'webhook',
      metadata: { object: input.payload.object },
    })
  }

  private async processMessage(
    establishmentId: string,
    message: NonNullable<WhatsAppEntry['changes'][0]['value']['messages']>[0]
  ): Promise<void> {
    // Only handle interactive button replies for now — text parsing is handled by n8n/AI
    if (message.type !== 'interactive') return

    const buttonId = message.interactive?.button_reply?.id
    if (!buttonId) return

    const customer = await this.findOrCreateCustomerUseCase.execute({
      establishmentId,
      whatsappNumber: message.from,
    })

    // Order creation from WhatsApp is handled by n8n workflow.
    // This receiver processes button confirmations and hands off customer data.
    void customer
  }
}
