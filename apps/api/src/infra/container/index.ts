import { db } from '@/infra/database/connection'
import { RedisProvider } from '@/infra/redis/RedisProvider'

// Auth
import { DrizzleUserRepository } from '@/modules/auth/infra/repositories/DrizzleUserRepository'
import { LoginUseCase } from '@/modules/auth/application/use-cases/LoginUseCase'
import { RefreshTokenUseCase } from '@/modules/auth/application/use-cases/RefreshTokenUseCase'
import { LogoutUseCase } from '@/modules/auth/application/use-cases/LogoutUseCase'
import { ChangePasswordUseCase } from '@/modules/auth/application/use-cases/ChangePasswordUseCase'
import { AuthController } from '@/modules/auth/infra/http/AuthController'

// Customers
import { FindOrCreateCustomerUseCase } from '@/modules/customers/application/use-cases/FindOrCreateCustomerUseCase'
import { DrizzleCustomerRepository } from '@/modules/customers/infra/repositories/DrizzleCustomerRepository'
import { ListCustomersUseCase } from '@/modules/customers/application/use-cases/ListCustomersUseCase'
import { GetCustomerDetailsUseCase } from '@/modules/customers/application/use-cases/GetCustomerDetailsUseCase'
import { CreateCustomerUseCase } from '@/modules/customers/application/use-cases/CreateCustomerUseCase'
import { UpdateCustomerUseCase } from '@/modules/customers/application/use-cases/UpdateCustomerUseCase'
import { DeleteCustomerUseCase } from '@/modules/customers/application/use-cases/DeleteCustomerUseCase'
import { CustomerController } from '@/modules/customers/infra/http/CustomerController'

// Products / Catalog
import { MenuController } from '@/modules/products/infra/http/MenuController'
import { CatalogController } from '@/modules/products/infra/http/CatalogController'

// Tables
import { DrizzleTableRepository } from '@/modules/tables/infra/repositories/DrizzleTableRepository'
import { DrizzleComandaRepository } from '@/modules/tables/infra/repositories/DrizzleComandaRepository'
import { ListTablesUseCase } from '@/modules/tables/application/use-cases/ListTablesUseCase'
import { CreateTableUseCase } from '@/modules/tables/application/use-cases/CreateTableUseCase'
import { UpdateTableUseCase } from '@/modules/tables/application/use-cases/UpdateTableUseCase'
import { DeleteTableUseCase } from '@/modules/tables/application/use-cases/DeleteTableUseCase'
import { OpenComandaUseCase } from '@/modules/tables/application/use-cases/OpenComandaUseCase'
import { CloseComandaUseCase } from '@/modules/tables/application/use-cases/CloseComandaUseCase'
import { GetComandaByCodeUseCase } from '@/modules/tables/application/use-cases/GetComandaByCodeUseCase'
import { ConfirmComandaUseCase } from '@/modules/tables/application/use-cases/ConfirmComandaUseCase'
import { TableController } from '@/modules/tables/infra/http/TableController'

// Staff
import { DrizzleStaffRepository } from '@/modules/users/infra/repositories/DrizzleStaffRepository'
import { ListStaffUseCase } from '@/modules/users/application/use-cases/ListStaffUseCase'
import { CreateStaffUseCase } from '@/modules/users/application/use-cases/CreateStaffUseCase'
import { UpdateStaffUseCase } from '@/modules/users/application/use-cases/UpdateStaffUseCase'
import { DeleteStaffUseCase } from '@/modules/users/application/use-cases/DeleteStaffUseCase'
import { ToggleStaffActiveUseCase } from '@/modules/users/application/use-cases/ToggleStaffActiveUseCase'
import { ResetStaffPasswordUseCase } from '@/modules/users/application/use-cases/ResetStaffPasswordUseCase'
import { ListRolesUseCase } from '@/modules/users/application/use-cases/ListRolesUseCase'
import { StaffController } from '@/modules/users/infra/http/StaffController'

// Orders
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/CreateOrderUseCase'
import { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'
import { UpdateOrderNotesUseCase } from '@/modules/orders/application/use-cases/UpdateOrderNotesUseCase'
import { GetOrderUseCase } from '@/modules/orders/application/use-cases/GetOrderUseCase'
import { ListOrdersUseCase } from '@/modules/orders/application/use-cases/ListOrdersUseCase'
import { OrderController } from '@/modules/orders/infra/http/OrderController'

// Kitchen
import { GetKitchenQueueUseCase } from '@/modules/kitchen/application/use-cases/GetKitchenQueueUseCase'
import { KitchenController } from '@/modules/kitchen/infra/http/KitchenController'

// Delivery
import { GetDeliveryQueueUseCase } from '@/modules/delivery/application/use-cases/GetDeliveryQueueUseCase'
import { UpdateDeliveryStatusUseCase } from '@/modules/delivery/application/use-cases/UpdateDeliveryStatusUseCase'
import { DeliveryController } from '@/modules/delivery/infra/http/DeliveryController'

// Cashier
import { OpenCashRegisterUseCase } from '@/modules/cashier/application/use-cases/OpenCashRegisterUseCase'
import { CloseCashRegisterUseCase } from '@/modules/cashier/application/use-cases/CloseCashRegisterUseCase'
import { AddCashMovementUseCase } from '@/modules/cashier/application/use-cases/AddCashMovementUseCase'
import { CashierController } from '@/modules/cashier/infra/http/CashierController'

// Dashboard
import { GetDashboardMetricsUseCase } from '@/modules/dashboard/application/use-cases/GetDashboardMetricsUseCase'
import { DashboardController } from '@/modules/dashboard/infra/http/DashboardController'

// Reports
import { ExportOrdersCSVUseCase } from '@/modules/reports/application/use-cases/ExportOrdersCSVUseCase'
import { GetMonthlyReportUseCase } from '@/modules/reports/application/use-cases/GetMonthlyReportUseCase'
import { ReportsController } from '@/modules/reports/infra/http/ReportsController'

// Settings
import { GetSettingsUseCase } from '@/modules/settings/application/use-cases/GetSettingsUseCase'
import { UpsertSettingUseCase } from '@/modules/settings/application/use-cases/UpsertSettingUseCase'
import { SettingsController } from '@/modules/settings/infra/http/SettingsController'

// Audit
import { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'

// Webhook
import { ReceiveWhatsAppWebhookUseCase } from '@/modules/webhook/application/use-cases/ReceiveWhatsAppWebhookUseCase'
import { WebhookController } from '@/modules/webhook/infra/http/WebhookController'

// Conversations
import { DrizzleConversationRepository } from '@/modules/conversations/infra/repositories/DrizzleConversationRepository'
import { WhatsAppSender } from '@/modules/conversations/infra/WhatsAppSender'
import { ListConversationsUseCase } from '@/modules/conversations/application/use-cases/ListConversationsUseCase'
import { GetConversationHistoryUseCase } from '@/modules/conversations/application/use-cases/GetConversationHistoryUseCase'
import { GetConversationContextUseCase } from '@/modules/conversations/application/use-cases/GetConversationContextUseCase'
import { LogMessageUseCase } from '@/modules/conversations/application/use-cases/LogMessageUseCase'
import { TakeoverConversationUseCase } from '@/modules/conversations/application/use-cases/TakeoverConversationUseCase'
import { ReleaseConversationUseCase } from '@/modules/conversations/application/use-cases/ReleaseConversationUseCase'
import { RequestHumanUseCase } from '@/modules/conversations/application/use-cases/RequestHumanUseCase'
import { MarkConversationReadUseCase } from '@/modules/conversations/application/use-cases/MarkConversationReadUseCase'
import { MarkAllConversationsReadUseCase } from '@/modules/conversations/application/use-cases/MarkAllConversationsReadUseCase'
import { SendAgentMessageUseCase } from '@/modules/conversations/application/use-cases/SendAgentMessageUseCase'
import { SendAgentMediaUseCase } from '@/modules/conversations/application/use-cases/SendAgentMediaUseCase'
import { SendAgentTemplateUseCase } from '@/modules/conversations/application/use-cases/SendAgentTemplateUseCase'
import { ExportConversationUseCase } from '@/modules/conversations/application/use-cases/ExportConversationUseCase'
import { FetchConversationMediaUseCase } from '@/modules/conversations/application/use-cases/FetchConversationMediaUseCase'
import { ConversationController } from '@/modules/conversations/infra/http/ConversationController'

// Fiscal
import { EmitFiscalDocumentUseCase } from '@/modules/fiscal/application/use-cases/EmitFiscalDocumentUseCase'
import { CancelFiscalDocumentUseCase } from '@/modules/fiscal/application/use-cases/CancelFiscalDocumentUseCase'
import { GetFiscalDocumentUseCase } from '@/modules/fiscal/application/use-cases/GetFiscalDocumentUseCase'
import { UpsertFiscalConfigUseCase } from '@/modules/fiscal/application/use-cases/UpsertFiscalConfigUseCase'
import { TestFiscalConnectionUseCase } from '@/modules/fiscal/application/use-cases/TestFiscalConnectionUseCase'
import { RetryFiscalDocumentUseCase } from '@/modules/fiscal/application/use-cases/RetryFiscalDocumentUseCase'
import { FiscalController } from '@/modules/fiscal/infra/http/FiscalController'

// WebSocket Hub (passed in from server bootstrap to avoid circular dep)
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'

export interface AppContainer {
  cache: RedisProvider
  menuController: MenuController
  catalogController: CatalogController
  authController: AuthController
  orderController: OrderController
  kitchenController: KitchenController
  deliveryController: DeliveryController
  cashierController: CashierController
  dashboardController: DashboardController
  reportsController: ReportsController
  settingsController: SettingsController
  webhookController: WebhookController
  customerController: CustomerController
  tableController: TableController
  staffController: StaffController
  conversationController: ConversationController
  fiscalController: FiscalController
}

export function buildContainer(wsHub: WebSocketHub): AppContainer {
  const cache = new RedisProvider()

  // Shared repos
  const userRepository = new DrizzleUserRepository(db)

  // Auth
  const loginUseCase = new LoginUseCase(userRepository, cache)
  const refreshTokenUseCase = new RefreshTokenUseCase(userRepository, cache)
  const logoutUseCase = new LogoutUseCase(cache)
  const changePasswordUseCase = new ChangePasswordUseCase(userRepository)
  const authController = new AuthController(loginUseCase, refreshTokenUseCase, logoutUseCase, changePasswordUseCase)

  // Products / Catalog
  const menuController = new MenuController(db, cache)
  const catalogController = new CatalogController(db, cache)

  // Shared use cases
  const findOrCreateCustomerUseCase = new FindOrCreateCustomerUseCase(db)
  const createAuditLogUseCase = new CreateAuditLogUseCase(db)
  const updateOrderStatusUseCase = new UpdateOrderStatusUseCase(db, wsHub)

  // Orders
  const createOrderUseCase = new CreateOrderUseCase(db, wsHub)
  const updateOrderNotesUseCase = new UpdateOrderNotesUseCase(db)
  const getOrderUseCase = new GetOrderUseCase(db)
  const listOrdersUseCase = new ListOrdersUseCase(db)
  const orderController = new OrderController(
    createOrderUseCase,
    updateOrderStatusUseCase,
    updateOrderNotesUseCase,
    getOrderUseCase,
    listOrdersUseCase
  )

  // Kitchen
  const getKitchenQueueUseCase = new GetKitchenQueueUseCase(db)
  const kitchenController = new KitchenController(getKitchenQueueUseCase, updateOrderStatusUseCase)

  // Delivery
  const getDeliveryQueueUseCase = new GetDeliveryQueueUseCase(db)
  const updateDeliveryStatusUseCase = new UpdateDeliveryStatusUseCase(db, wsHub)
  const deliveryController = new DeliveryController(
    getDeliveryQueueUseCase,
    updateDeliveryStatusUseCase
  )

  // Cashier
  const openCashRegisterUseCase = new OpenCashRegisterUseCase(db)
  const closeCashRegisterUseCase = new CloseCashRegisterUseCase(db)
  const addCashMovementUseCase = new AddCashMovementUseCase(db)
  const cashierController = new CashierController(
    openCashRegisterUseCase,
    closeCashRegisterUseCase,
    addCashMovementUseCase,
    db
  )

  // Dashboard
  const getDashboardMetricsUseCase = new GetDashboardMetricsUseCase(db, cache)
  const dashboardController = new DashboardController(getDashboardMetricsUseCase)

  // Reports
  const exportOrdersCSVUseCase = new ExportOrdersCSVUseCase(db)
  const getMonthlyReportUseCase = new GetMonthlyReportUseCase(db, cache)
  const reportsController = new ReportsController(exportOrdersCSVUseCase, getMonthlyReportUseCase)

  // Settings
  const getSettingsUseCase = new GetSettingsUseCase(db)
  const upsertSettingUseCase = new UpsertSettingUseCase(db)
  const settingsController = new SettingsController(getSettingsUseCase, upsertSettingUseCase)

  // Webhook
  const receiveWebhookUseCase = new ReceiveWhatsAppWebhookUseCase(
    cache,
    findOrCreateCustomerUseCase,
    createAuditLogUseCase
  )
  const webhookController = new WebhookController(receiveWebhookUseCase)

  // Customers
  const customerRepository = new DrizzleCustomerRepository(db)
  const listCustomersUseCase = new ListCustomersUseCase(customerRepository)
  const getCustomerDetailsUseCase = new GetCustomerDetailsUseCase(customerRepository)
  const createCustomerUseCase = new CreateCustomerUseCase(customerRepository)
  const updateCustomerUseCase = new UpdateCustomerUseCase(customerRepository)
  const deleteCustomerUseCase = new DeleteCustomerUseCase(customerRepository)
  const customerController = new CustomerController(
    listCustomersUseCase,
    getCustomerDetailsUseCase,
    createCustomerUseCase,
    updateCustomerUseCase,
    deleteCustomerUseCase
  )

  // Tables + Comanda
  const tableRepository = new DrizzleTableRepository(db)
  const comandaRepository = new DrizzleComandaRepository(db)
  const listTablesUseCase = new ListTablesUseCase(tableRepository)
  const createTableUseCase = new CreateTableUseCase(tableRepository)
  const updateTableUseCase = new UpdateTableUseCase(tableRepository)
  const deleteTableUseCase = new DeleteTableUseCase(tableRepository)
  const openComandaUseCase = new OpenComandaUseCase(tableRepository, comandaRepository)
  const closeComandaUseCase = new CloseComandaUseCase(tableRepository, comandaRepository)
  const getComandaByCodeUseCase = new GetComandaByCodeUseCase(comandaRepository)
  const confirmComandaUseCase = new ConfirmComandaUseCase(comandaRepository)
  const tableController = new TableController(
    listTablesUseCase,
    createTableUseCase,
    updateTableUseCase,
    deleteTableUseCase,
    openComandaUseCase,
    closeComandaUseCase,
    getComandaByCodeUseCase,
    confirmComandaUseCase,
    comandaRepository
  )

  // Conversations
  const conversationRepository = new DrizzleConversationRepository(db)
  const whatsAppSender = new WhatsAppSender()
  const listConversationsUseCase = new ListConversationsUseCase(conversationRepository)
  const getConversationHistoryUseCase = new GetConversationHistoryUseCase(conversationRepository)
  const getConversationContextUseCase = new GetConversationContextUseCase(conversationRepository)
  const logMessageUseCase = new LogMessageUseCase(conversationRepository, wsHub)
  const takeoverConversationUseCase = new TakeoverConversationUseCase(conversationRepository, wsHub)
  const releaseConversationUseCase = new ReleaseConversationUseCase(conversationRepository, wsHub)
  const requestHumanUseCase = new RequestHumanUseCase(conversationRepository, wsHub)
  const markConversationReadUseCase = new MarkConversationReadUseCase(conversationRepository)
  const markAllConversationsReadUseCase = new MarkAllConversationsReadUseCase(conversationRepository)
  const sendAgentMessageUseCase = new SendAgentMessageUseCase(conversationRepository, whatsAppSender, wsHub)
  const sendAgentMediaUseCase = new SendAgentMediaUseCase(conversationRepository, whatsAppSender, wsHub)
  const sendAgentTemplateUseCase = new SendAgentTemplateUseCase(conversationRepository, whatsAppSender, wsHub)
  const exportConversationUseCase = new ExportConversationUseCase(conversationRepository)
  const fetchConversationMediaUseCase = new FetchConversationMediaUseCase(whatsAppSender)
  const conversationController = new ConversationController(
    listConversationsUseCase,
    getConversationHistoryUseCase,
    getConversationContextUseCase,
    logMessageUseCase,
    takeoverConversationUseCase,
    releaseConversationUseCase,
    requestHumanUseCase,
    markConversationReadUseCase,
    markAllConversationsReadUseCase,
    sendAgentMessageUseCase,
    sendAgentMediaUseCase,
    sendAgentTemplateUseCase,
    exportConversationUseCase,
    fetchConversationMediaUseCase
  )

  // Staff
  const staffRepository = new DrizzleStaffRepository(db)
  const listStaffUseCase = new ListStaffUseCase(staffRepository)
  const createStaffUseCase = new CreateStaffUseCase(staffRepository)
  const updateStaffUseCase = new UpdateStaffUseCase(staffRepository)
  const deleteStaffUseCase = new DeleteStaffUseCase(staffRepository)
  const toggleStaffActiveUseCase = new ToggleStaffActiveUseCase(staffRepository)
  const resetStaffPasswordUseCase = new ResetStaffPasswordUseCase(staffRepository)
  const listRolesUseCase = new ListRolesUseCase(staffRepository)
  const staffController = new StaffController(
    listStaffUseCase,
    createStaffUseCase,
    updateStaffUseCase,
    deleteStaffUseCase,
    toggleStaffActiveUseCase,
    resetStaffPasswordUseCase,
    listRolesUseCase
  )

  // Fiscal
  const emitFiscalDocumentUseCase = new EmitFiscalDocumentUseCase(db, wsHub)
  const cancelFiscalDocumentUseCase = new CancelFiscalDocumentUseCase(db, wsHub)
  const getFiscalDocumentUseCase = new GetFiscalDocumentUseCase(db)
  const upsertFiscalConfigUseCase = new UpsertFiscalConfigUseCase(db)
  const testFiscalConnectionUseCase = new TestFiscalConnectionUseCase()
  const retryFiscalDocumentUseCase = new RetryFiscalDocumentUseCase(db, wsHub)
  const fiscalController = new FiscalController(
    emitFiscalDocumentUseCase,
    cancelFiscalDocumentUseCase,
    getFiscalDocumentUseCase,
    upsertFiscalConfigUseCase,
    testFiscalConnectionUseCase,
    retryFiscalDocumentUseCase
  )

  return {
    cache,
    menuController,
    catalogController,
    authController,
    orderController,
    kitchenController,
    deliveryController,
    cashierController,
    dashboardController,
    reportsController,
    settingsController,
    webhookController,
    customerController,
    tableController,
    staffController,
    conversationController,
    fiscalController,
  }
}
