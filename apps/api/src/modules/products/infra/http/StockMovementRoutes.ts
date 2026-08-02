import type { Router } from '@/infra/http/router'
import type { StockMovementController } from './StockMovementController'
import { authenticate } from '@/infra/http/middlewares/authenticate'
import { authorize } from '@/infra/http/middlewares/authorize'

export function registerStockMovementRoutes(router: Router, controller: StockMovementController) {
  const write = [authenticate, authorize('products', 'write')]

  router.post('/stock-movements', ...write, controller.create)
}
