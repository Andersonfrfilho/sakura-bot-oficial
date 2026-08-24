import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { WhatsAppSettingsController } from './WhatsAppSettingsController'

export function registerWhatsAppSettingsRoutes(
  router: Router,
  controller: WhatsAppSettingsController
): void {
  router.get('/whatsapp/settings', authenticate, authorize('settings', 'read'), controller.get)
  router.put('/whatsapp/settings', authenticate, authorize('settings', 'write'), controller.save)

  router.get(
    '/whatsapp/templates',
    authenticate,
    authorize('settings', 'read'),
    controller.listTemplates
  )
  router.post(
    '/whatsapp/templates',
    authenticate,
    authorize('settings', 'write'),
    controller.createTemplate
  )

  router.get('/whatsapp/flows', authenticate, authorize('settings', 'read'), controller.listFlows)
  router.post('/whatsapp/flows', authenticate, authorize('settings', 'write'), controller.createFlow)
  // Antes de `/whatsapp/flows/:key`: caso contrário `:key` casaria com "live-positions" primeiro.
  router.get(
    '/whatsapp/flows/live-positions',
    authenticate,
    authorize('settings', 'read'),
    controller.liveFlowPositions
  )
  router.get('/whatsapp/flows/:key', authenticate, authorize('settings', 'read'), controller.getFlow)
  router.put('/whatsapp/flows/:key', authenticate, authorize('settings', 'write'), controller.saveFlow)
  router.delete('/whatsapp/flows/:key', authenticate, authorize('settings', 'write'), controller.deleteFlow)
}
