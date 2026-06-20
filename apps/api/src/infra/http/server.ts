import uWS from 'uWebSockets.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Router } from './router'
import { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { buildContainer } from '@/infra/container'
import { checkDatabaseConnection, runMigrations } from '@/infra/database/connection'
import { checkRedisConnection } from '@/infra/redis/connection'
import { RedisProvider } from '@/infra/redis/RedisProvider'
import { registerAuthRoutes } from '@/modules/auth/infra/http/AuthRoutes'
import { registerOrderRoutes } from '@/modules/orders/infra/http/OrderRoutes'
import { registerKitchenRoutes } from '@/modules/kitchen/infra/http/KitchenRoutes'
import { registerDeliveryRoutes } from '@/modules/delivery/infra/http/DeliveryRoutes'
import { registerCashierRoutes } from '@/modules/cashier/infra/http/CashierRoutes'
import { registerDashboardRoutes } from '@/modules/dashboard/infra/http/DashboardRoutes'
import { registerReportsRoutes } from '@/modules/reports/infra/http/ReportsRoutes'
import { registerSettingsRoutes } from '@/modules/settings/infra/http/SettingsRoutes'
import { registerWebhookRoutes } from '@/modules/webhook/infra/http/WebhookRoutes'
import { registerCustomerRoutes } from '@/modules/customers/infra/http/CustomerRoutes'
import { registerTableRoutes } from '@/modules/tables/infra/http/TableRoutes'
import { registerMenuRoutes } from '@/modules/products/infra/http/MenuRoutes'
import { registerStaffRoutes } from '@/modules/users/infra/http/StaffRoutes'
import { registerCatalogRoutes } from '@/modules/products/infra/http/CatalogRoutes'
import { generateOpenAPISpec } from '@/infra/docs/openapi'

const PORT = parseInt(process.env.PORT ?? '3333')
const NODE_ENV = process.env.NODE_ENV ?? 'development'

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',')

const SCALAR_TEMPLATE = readFileSync(join(__dirname, '../docs/scalar.html'), 'utf-8')

function renderDocs(): string {
  const spec = generateOpenAPISpec()
  return SCALAR_TEMPLATE.replace('__OPENAPI_SPEC__', JSON.stringify(spec))
}

export async function createServer() {
  await checkDatabaseConnection()
  await runMigrations()
  await checkRedisConnection()

  const app = uWS.App()
  const router = new Router(app)
  const wsHub = new WebSocketHub(app, new RedisProvider())
  const container = buildContainer(wsHub)

  // CORS pre-flight
  app.options('/*', (res, req) => {
    const origin = req.getHeader('origin')
    res.cork(() => {
      if (ALLOWED_ORIGINS.includes(origin)) {
        res
          .writeStatus('204 No Content')
          .writeHeader('Access-Control-Allow-Origin', origin)
          .writeHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
          .writeHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
          .writeHeader('Access-Control-Max-Age', '86400')
          .end()
      } else {
        res.writeStatus('403 Forbidden').end()
      }
    })
  })

  // Health check
  router.get('/health', async (_request, response) => {
    response.json({ status: 'ok', timestamp: new Date().toISOString(), env: NODE_ENV })
  })

  // OpenAPI spec (JSON) + CORS
  app.get('/api/openapi.json', (res, req) => {
    const origin = req.getHeader('origin')
    const spec = generateOpenAPISpec()
    const body = JSON.stringify(spec)
    res.cork(() => {
      res.writeStatus('200 OK')
        .writeHeader('Content-Type', 'application/json; charset=utf-8')
        .writeHeader('Access-Control-Allow-Origin', '*')
        .end(body)
    })
  })

  // Scalar API docs (HTML) — spec injetado inline (zero fetch)
  app.get('/docs', (res) => {
    const html = renderDocs()
    res.cork(() => {
      res.writeStatus('200 OK')
        .writeHeader('Content-Type', 'text/html; charset=utf-8')
        .end(html)
    })
  })

  // Register all module routes
  registerAuthRoutes(router, container.authController)
  registerOrderRoutes(router, container.orderController)
  registerKitchenRoutes(router, container.kitchenController)
  registerDeliveryRoutes(router, container.deliveryController)
  registerCashierRoutes(router, container.cashierController)
  registerDashboardRoutes(router, container.dashboardController)
  registerReportsRoutes(router, container.reportsController)
  registerSettingsRoutes(router, container.settingsController)
  registerWebhookRoutes(router, container.webhookController)
  registerCustomerRoutes(router, container.customerController)
  registerTableRoutes(router, container.tableController)
  registerMenuRoutes(router, container.menuController)
  registerStaffRoutes(router, container.staffController)
  registerCatalogRoutes(router, container.catalogController)

  return {
    listen() {
      app.listen(PORT, (token) => {
        if (token) {
          console.log(`[API] Listening on port ${PORT} [${NODE_ENV}]`)
        } else {
          console.error(`[API] Failed to listen on port ${PORT}`)
          process.exit(1)
        }
      })
    },
  }
}
