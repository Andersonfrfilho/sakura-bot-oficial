import uWS from 'uWebSockets.js'
import { readFileSync, existsSync } from 'fs'
import { extname, join } from 'path'
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
import { registerDeliveryFeeRoutes } from '@/modules/settings/infra/http/DeliveryFeeRoutes'
import { registerWebhookRoutes } from '@/modules/webhook/infra/http/WebhookRoutes'
import { registerCustomerRoutes } from '@/modules/customers/infra/http/CustomerRoutes'
import { registerAddressRoutes } from '@/modules/customers/infra/http/AddressRoutes'
import { registerTableRoutes } from '@/modules/tables/infra/http/TableRoutes'
import { registerMenuRoutes } from '@/modules/products/infra/http/MenuRoutes'
import { registerStaffRoutes } from '@/modules/users/infra/http/StaffRoutes'
import { registerRoleRoutes } from '@/modules/users/infra/http/RoleRoutes'
import { registerCatalogRoutes } from '@/modules/products/infra/http/CatalogRoutes'
import { registerSectionRoutes } from '@/modules/products/infra/http/SectionRoutes'
import { registerIngredientRoutes } from '@/modules/products/infra/http/IngredientRoutes'
import { registerStockBatchRoutes } from '@/modules/products/infra/http/StockBatchRoutes'
import { registerStockMovementRoutes } from '@/modules/products/infra/http/StockMovementRoutes'
import { registerConversationRoutes } from '@/modules/conversations/infra/http/ConversationRoutes'
import { registerWhatsAppSettingsRoutes } from '@/modules/conversations/infra/http/WhatsAppSettingsRoutes'
import { registerFiscalRoutes } from '@/modules/fiscal/infra/http/FiscalRoutes'
import { registerMonthlyAccountRoutes } from '@/modules/finance/infra/http/MonthlyAccountRoutes'
import { registerExpenseRoutes } from '@/modules/finance/infra/http/ExpenseRoutes'
import { registerUploadRoutes } from '@/modules/uploads/infra/http/UploadRoutes'
import { LocalStorageProvider } from '@/shared/providers/LocalStorageProvider'
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

  // Graceful shutdown: drain workers before exiting
  const shutdownWorkers = async (): Promise<void> => {
    if (container.fiscalWorker) await container.fiscalWorker.close()
    if (container.financeWorker) await container.financeWorker.close()
    if (container.ifoodWorker) await container.ifoodWorker.close()
    process.exit(0)
  }

  if (container.fiscalWorker || container.financeWorker || container.ifoodWorker) {
    process.on('SIGTERM', shutdownWorkers)
    process.on('SIGINT', shutdownWorkers)
  }

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
  registerDeliveryFeeRoutes(router, container.deliveryFeeController)
  registerWebhookRoutes(router, container.webhookController)
  registerCustomerRoutes(router, container.customerController)
  registerAddressRoutes(router, container.addressController)
  registerTableRoutes(router, container.tableController)
  registerMenuRoutes(router, container.menuController)
  registerStaffRoutes(router, container.staffController)
  registerRoleRoutes(router, container.roleController)
  registerCatalogRoutes(router, container.catalogController)
  registerSectionRoutes(router, container.sectionController)
  registerIngredientRoutes(router, container.ingredientController)
  registerStockBatchRoutes(router, container.stockBatchController)
  registerStockMovementRoutes(router, container.stockMovementController)
  registerConversationRoutes(router, container.conversationController)
  registerWhatsAppSettingsRoutes(router, container.whatsAppSettingsController)
  registerFiscalRoutes(router, container.fiscalController)
  registerMonthlyAccountRoutes(router, container.monthlyAccountController)
  registerExpenseRoutes(router, container.expenseController)
  registerUploadRoutes(router, container.uploadController)

  // Serve uploaded files (public)
  const storageProvider = new LocalStorageProvider()
  const CACHEABLE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.ico', '.css', '.js', '.woff2'])

  const MIME_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
  }

  app.get('/uploads/:key', (res, req) => {
    const key = req.getParameter(0)
    if (!key) {
      res.cork(() => {
        res.writeStatus('404 Not Found').end('File not found')
      })
      return
    }

    const filePath = storageProvider.getFilePath(key)

    if (!existsSync(filePath)) {
      res.cork(() => {
        res.writeStatus('404 Not Found').end('File not found')
      })
      return
    }

    const extension = extname(key).toLowerCase()
    const contentType = MIME_TYPES[extension] ?? 'application/octet-stream'

    const buffer = readFileSync(filePath)
    res.cork(() => {
      res.writeStatus('200 OK')
      res.writeHeader('Content-Type', contentType)
      if (CACHEABLE_EXTENSIONS.has(extension)) {
        res.writeHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
      res.end(buffer)
    })
  })

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
