import { readFileSync, existsSync } from 'fs'
import { extname, join } from 'path'
import type { ServerWebSocket, Server } from 'bun'
import { Router, corsAndSecurityHeaders, type ParsedRequest, type ResponseHelper } from './router'
import { WebSocketHub, type WsClientData } from '@/infra/websocket/WebSocketHub'
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
import { registerPreviewInboundRoutes } from '@/modules/webhook/infra/http/PreviewInboundRoutes'
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

function notFoundResponse(origin: string): Response {
  const body = JSON.stringify({ error: 'not_found', message: 'Route not found' })
  const headers = corsAndSecurityHeaders(origin)
  headers.set('Content-Type', 'application/json')
  return new Response(body, { status: 404, headers })
}

export async function createServer() {
  await checkDatabaseConnection()
  await runMigrations()
  await checkRedisConnection()

  const router = new Router()
  const wsHub = new WebSocketHub(new RedisProvider())
  const container = buildContainer(wsHub)

  // Graceful shutdown: drain workers before exiting
  const shutdownWorkers = async (): Promise<void> => {
    if (container.fiscalWorker) await container.fiscalWorker.close()
    if (container.financeWorker) await container.financeWorker.close()
    if (container.ifoodWorker) await container.ifoodWorker.close()
    if (container.productAffinityWorker) await container.productAffinityWorker.close()
    if (container.stockWorker) await container.stockWorker.close()
    if (container.documentIngestionWorker) await container.documentIngestionWorker.close()
    process.exit(0)
  }

  if (
    container.fiscalWorker ||
    container.financeWorker ||
    container.ifoodWorker ||
    container.productAffinityWorker ||
    container.stockWorker ||
    container.documentIngestionWorker
  ) {
    process.on('SIGTERM', shutdownWorkers)
    process.on('SIGINT', shutdownWorkers)
  }

  router.get('/health', async (_request: ParsedRequest, response: ResponseHelper) => {
    response.json({ status: 'ok', timestamp: new Date().toISOString(), env: NODE_ENV })
  })

  // Register all module routes
  registerAuthRoutes(router, container.authController)
  registerOrderRoutes(router, container.orderController, container.orderReferenceDataController)
  registerKitchenRoutes(router, container.kitchenController)
  registerDeliveryRoutes(router, container.deliveryController)
  registerCashierRoutes(router, container.cashierController)
  registerDashboardRoutes(router, container.dashboardController)
  registerReportsRoutes(router, container.reportsController)
  registerSettingsRoutes(router, container.settingsController)
  registerDeliveryFeeRoutes(router, container.deliveryFeeController)
  registerWebhookRoutes(router, container.webhookController)
  // Antes de `registerConversationRoutes`: "preview" casaria com `/conversations/:whatsapp`.
  registerPreviewInboundRoutes(router, container.previewInboundController, container.previewMediaController)
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

  function serveUpload(key: string): Response {
    const filePath = storageProvider.getFilePath(key)
    if (!existsSync(filePath)) {
      return new Response('File not found', { status: 404 })
    }

    const extension = extname(key).toLowerCase()
    const contentType = MIME_TYPES[extension] ?? 'application/octet-stream'
    const buffer = readFileSync(filePath)
    const headers = new Headers({ 'Content-Type': contentType })
    if (CACHEABLE_EXTENSIONS.has(extension)) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    }
    return new Response(buffer, { status: 200, headers })
  }

  function handleCorsPreflight(origin: string): Response {
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response(null, { status: 403 })
    }
    const headers = new Headers({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    })
    return new Response(null, { status: 204, headers })
  }

  async function fetch(request: Request, server: Server<WsClientData>): Promise<Response | undefined> {
    const url = new URL(request.url)
    const origin = request.headers.get('origin') ?? ''

    if (request.method === 'OPTIONS') {
      return handleCorsPreflight(origin)
    }

    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(request, { data: wsHub.createClientData() })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    if (url.pathname === '/api/openapi.json') {
      const spec = generateOpenAPISpec()
      const headers = new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      })
      return new Response(JSON.stringify(spec), { status: 200, headers })
    }

    if (url.pathname === '/docs') {
      const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' })
      return new Response(renderDocs(), { status: 200, headers })
    }

    if (url.pathname.startsWith('/uploads/')) {
      const key = url.pathname.slice('/uploads/'.length)
      if (!key) return new Response('File not found', { status: 404 })
      return serveUpload(key)
    }

    const routed = await router.handle(request)
    if (routed) return routed

    // Sem esta rota, respostas 404 chegariam sem Content-Type e sem CORS — no browser
    // isso vira "Failed to fetch", e o cliente não distingue rota inexistente de API fora do ar.
    return notFoundResponse(origin)
  }

  return {
    listen() {
      const server = Bun.serve<WsClientData>({
        port: PORT,
        fetch,
        websocket: {
          open(ws: ServerWebSocket<WsClientData>) {
            wsHub.open(ws)
          },
          message(ws: ServerWebSocket<WsClientData>, message: string | Buffer) {
            void wsHub.message(ws, message)
          },
          close(ws: ServerWebSocket<WsClientData>) {
            wsHub.close(ws)
          },
        },
      })
      console.log(`[API] Listening on port ${server.port} [${NODE_ENV}]`)
    },
  }
}
