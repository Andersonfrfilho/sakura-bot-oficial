import type { RouteHandler } from '@/infra/http/router'
import type { ReceiveWhatsAppWebhookUseCase } from '../../application/use-cases/ReceiveWhatsAppWebhookUseCase'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import { randomUUID } from 'crypto'

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? 'change-verify-token'

export class WebhookController {
  constructor(private readonly receiveWebhookUseCase: ReceiveWhatsAppWebhookUseCase) {}

  // GET /webhook — Meta hub.challenge verification
  verify: RouteHandler = async (request, response) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = request.query

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      response.json(parseInt(challenge ?? '0'))
    } else {
      throw new UnauthorizedError('invalid_verify_token')
    }
  }

  // POST /webhook/:establishmentId — incoming WhatsApp messages
  receive: RouteHandler = async (request, response) => {
    const establishmentId = request.params['establishmentId']
    if (!establishmentId) throw new ValidationError('establishmentId is required')

    const signature = request.headers['x-hub-signature-256'] ?? ''
    const nonce = request.headers['x-webhook-nonce'] ?? randomUUID()

    await this.receiveWebhookUseCase.execute({
      establishmentId,
      rawBody: request.rawBody,
      signature,
      nonce,
      payload: request.body as never,
    })

    response.json({ status: 'ok' })
  }
}
