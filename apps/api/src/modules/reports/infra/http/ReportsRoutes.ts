import type { Router } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import type { ReportsController } from './ReportsController'

export function registerReportsRoutes(router: Router, controller: ReportsController): void {
  router.get('/reports/orders/export', authenticate, authorize('reports', 'read'), controller.exportOrders)
  router.get('/reports/monthly', authenticate, authorize('reports', 'read'), controller.getMonthlyReport)
}
