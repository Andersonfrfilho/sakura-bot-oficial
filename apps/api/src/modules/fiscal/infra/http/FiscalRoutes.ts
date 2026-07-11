import type { Router } from '@/infra/http/router'
import { authenticate, authorize, internalAuth } from '@/infra/http/middlewares'
import type { FiscalController } from './FiscalController'

export function registerFiscalRoutes(router: Router, controller: FiscalController): void {
  // Emit fiscal document for an order
  router.post(
    '/orders/:orderId/fiscal-document',
    authenticate,
    authorize('orders', 'write'),
    controller.emit
  )

  // Get fiscal document by order
  router.get(
    '/orders/:orderId/fiscal-document',
    authenticate,
    authorize('orders', 'read'),
    controller.getByOrder
  )

  // List all fiscal documents
  router.get(
    '/fiscal-documents',
    authenticate,
    authorize('orders', 'read'),
    controller.list
  )

  // Cancel fiscal document
  router.post(
    '/fiscal-documents/:id/cancel',
    authenticate,
    authorize('orders', 'write'),
    controller.cancel
  )

  // Download XML
  router.get(
    '/fiscal-documents/:id/xml',
    authenticate,
    authorize('orders', 'read'),
    controller.downloadXml
  )

  // Get PDF URL
  router.get(
    '/fiscal-documents/:id/pdf',
    authenticate,
    authorize('orders', 'read'),
    controller.getPdfUrl
  )

  // Get fiscal config
  router.get(
    '/fiscal-config',
    authenticate,
    authorize('settings', 'read'),
    controller.getConfig
  )

  // Upsert fiscal config
  router.put(
    '/fiscal-config',
    authenticate,
    authorize('settings', 'write'),
    controller.upsertConfig
  )

  // Test fiscal connection
  router.post(
    '/fiscal-config/test',
    authenticate,
    authorize('settings', 'write'),
    controller.testConnection
  )

  // Retry a rejected document
  router.post(
    '/fiscal-documents/:id/retry',
    authenticate,
    authorize('orders', 'write'),
    controller.retry
  )

  // Retry all pending documents (called by n8n cron — internal only)
  router.post(
    '/fiscal-documents/retry-pending',
    internalAuth,
    controller.retryPending
  )
}
