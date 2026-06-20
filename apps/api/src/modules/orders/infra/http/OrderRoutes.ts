import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { OrderController } from './OrderController'

export function registerOrderRoutes(router: Router, controller: OrderController): void {
  router.get('/orders', authenticate, authorize('orders', 'read'), controller.list)
  router.post('/orders', authenticate, authorize('orders', 'write'), controller.create)
  router.get('/orders/:id', authenticate, authorize('orders', 'read'), controller.get)
  router.patch('/orders/:id/status', authenticate, authorize('orders', 'write'), controller.updateStatus)
}
