import type { Router } from '@/infra/http/router'
import type { WebhookController } from './WebhookController'

// Webhook routes have no auth middleware — they use HMAC verification instead
export function registerWebhookRoutes(router: Router, controller: WebhookController): void {
  router.get('/webhook', controller.verify)
  router.post('/webhook/:establishmentId', controller.receive)
}
