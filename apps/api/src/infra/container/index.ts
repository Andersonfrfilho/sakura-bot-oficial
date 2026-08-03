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
import { ListAddressesUseCase } from '@/modules/customers/application/use-cases/ListAddressesUseCase'
import { CreateAddressUseCase } from '@/modules/customers/application/use-cases/CreateAddressUseCase'
import { UpdateAddressUseCase } from '@/modules/customers/application/use-cases/UpdateAddressUseCase'
import { DeleteAddressUseCase } from '@/modules/customers/application/use-cases/DeleteAddressUseCase'
import { SetDefaultAddressUseCase } from '@/modules/customers/application/use-cases/SetDefaultAddressUseCase'
import { AddressController } from '@/modules/customers/infra/http/AddressController'
import { DrizzleAddressRepository } from '@/modules/customers/infra/repositories/DrizzleAddressRepository'

// Products / Catalog
import { MenuController } from '@/modules/products/infra/http/MenuController'
import { CatalogController } from '@/modules/products/infra/http/CatalogController'
import { SectionController } from '@/modules/products/infra/http/SectionController'
import { IngredientController } from '@/modules/products/infra/http/IngredientController'
import { StockBatchController } from '@/modules/products/infra/http/StockBatchController'
import { CreateStockBatchUseCase } from '@/modules/products/application/use-cases/CreateStockBatchUseCase'
import { DeductStockForOrderUseCase } from '@/modules/products/application/use-cases/DeductStockForOrderUseCase'
import { StockMovementController } from '@/modules/products/infra/http/StockMovementController'
import { CreateStockMovementUseCase } from '@/modules/products/application/use-cases/CreateStockMovementUseCase'

// Tables
import { DrizzleTableRepository } from '@/modules/tables/infra/repositories/DrizzleTableRepository'
import { DrizzleComandaRepository } from '@/modules/tables/infra/repositories/DrizzleComandaRepository'
import { ListTablesUseCase } from '@/modules/tables/application/use-cases/ListTablesUseCase'
import { CreateTableUseCase } from '@/modules/tables/application/use-cases/CreateTableUseCase'
import { UpdateTablePositionUseCase } from '@/modules/tables/application/use-cases/UpdateTablePositionUseCase'
import { GroupTablesUseCase } from '@/modules/tables/application/use-cases/GroupTablesUseCase'
import { ListComandasByTableUseCase } from '@/modules/tables/application/use-cases/ListComandasByTableUseCase'
import { UngroupTablesUseCase } from '@/modules/tables/application/use-cases/UngroupTablesUseCase'
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
import { CreateRoleUseCase } from '@/modules/users/application/use-cases/CreateRoleUseCase'
import { UpdateRoleUseCase } from '@/modules/users/application/use-cases/UpdateRoleUseCase'
import { DeleteRoleUseCase } from '@/modules/users/application/use-cases/DeleteRoleUseCase'
import { GetRoleWithPermissionsUseCase } from '@/modules/users/application/use-cases/GetRoleWithPermissionsUseCase'
import { ListRolesWithPermissionsUseCase } from '@/modules/users/application/use-cases/ListRolesWithPermissionsUseCase'
import { AssignPermissionsUseCase } from '@/modules/users/application/use-cases/AssignPermissionsUseCase'
import { StaffController } from '@/modules/users/infra/http/StaffController'
import { RoleController } from '@/modules/users/infra/http/RoleController'

// Orders
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/CreateOrderUseCase'
import { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'
import { TriggerFiscalEmissionUseCase } from '@/modules/fiscal/application/use-cases/TriggerFiscalEmissionUseCase'
import { UpdateOrderNotesUseCase } from '@/modules/orders/application/use-cases/UpdateOrderNotesUseCase'
import { GetOrderUseCase } from '@/modules/orders/application/use-cases/GetOrderUseCase'
import { ListOrdersUseCase } from '@/modules/orders/application/use-cases/ListOrdersUseCase'
import { OrderController } from '@/modules/orders/infra/http/OrderController'
import { RequestPartialOrderConfirmationUseCase } from '@/modules/orders/application/use-cases/RequestPartialOrderConfirmationUseCase'
import { ListPaymentTypesUseCase } from '@/modules/orders/application/use-cases/ListPaymentTypesUseCase'
import { ListOrderTypesUseCase } from '@/modules/orders/application/use-cases/ListOrderTypesUseCase'
import { OrderReferenceDataController } from '@/modules/orders/infra/http/OrderReferenceDataController'
import { BotConfigRepository } from '@/infra/database/BotConfigRepository'
import { CalculateDeliveryFeeUseCase } from '@/modules/delivery/application/use-cases/CalculateDeliveryFeeUseCase'
import type { CustomerMessageProvider } from '@/shared/providers/CustomerMessageProvider'
import {
  CONVERSATION_AGENT_SENDER,
  CONVERSATION_START_STATE,
} from '@/modules/conversations/shared/conversations.constant'

// Kitchen
import { GetKitchenQueueUseCase } from '@/modules/kitchen/application/use-cases/GetKitchenQueueUseCase'
import { MarkOrderItemReadyUseCase } from '@/modules/kitchen/application/use-cases/MarkOrderItemReadyUseCase'
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
import { GetFunnelAnalysisUseCase } from '@/modules/reports/application/use-cases/GetFunnelAnalysisUseCase'
import { GetTableMetricsUseCase } from '@/modules/reports/application/use-cases/GetTableMetricsUseCase'
import { GetIngredientsRankingUseCase } from '@/modules/reports/application/use-cases/GetIngredientsRankingUseCase'
import { GetProductProfitUseCase } from '@/modules/reports/application/use-cases/GetProductProfitUseCase'
import { GetPreparationTimeComparisonUseCase } from '@/modules/reports/application/use-cases/GetPreparationTimeComparisonUseCase'
import { ReportsController } from '@/modules/reports/infra/http/ReportsController'

// Settings
import { GetSettingsUseCase } from '@/modules/settings/application/use-cases/GetSettingsUseCase'
import { UpsertSettingUseCase } from '@/modules/settings/application/use-cases/UpsertSettingUseCase'
import { SettingsController } from '@/modules/settings/infra/http/SettingsController'
import { DeliveryFeeController } from '@/modules/settings/infra/http/DeliveryFeeController'

// Audit
import { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'

// Webhook
import { WebhookController } from '@/modules/webhook/infra/http/WebhookController'

// Conversations — servidas pelo @adatechnology/meta-whatsapp-module
import { createMetaWhatsAppModuleRegistry } from '@/modules/conversations/infra/whatsapp/metaWhatsAppModule'
import { ConversationController } from '@/modules/conversations/infra/http/ConversationController'
import { WhatsAppTemplateProvider } from '@adatechnology/meta-whatsapp-provider'
import { WhatsAppSettingsController } from '@/modules/conversations/infra/http/WhatsAppSettingsController'

// Finance
import { MonthlyAccountController } from '@/modules/finance/infra/http/MonthlyAccountController'
import { ExpenseController } from '@/modules/finance/infra/http/ExpenseController'

// Fiscal
import { EmitFiscalDocumentUseCase } from '@/modules/fiscal/application/use-cases/EmitFiscalDocumentUseCase'
import { CancelFiscalDocumentUseCase } from '@/modules/fiscal/application/use-cases/CancelFiscalDocumentUseCase'
import { GetFiscalDocumentUseCase } from '@/modules/fiscal/application/use-cases/GetFiscalDocumentUseCase'
import { UpsertFiscalConfigUseCase } from '@/modules/fiscal/application/use-cases/UpsertFiscalConfigUseCase'
import { TestFiscalConnectionUseCase } from '@/modules/fiscal/application/use-cases/TestFiscalConnectionUseCase'
import { RetryFiscalDocumentUseCase } from '@/modules/fiscal/application/use-cases/RetryFiscalDocumentUseCase'
import { PrintFiscalCupomUseCase } from '@/modules/fiscal/application/use-cases/PrintFiscalCupomUseCase'
import { GenerateFiscalPdfUseCase } from '@/modules/fiscal/application/use-cases/GenerateFiscalPdfUseCase'
import { ThermalPrinterProvider } from '@/modules/fiscal/application/printing/ThermalPrinterProvider'
import { FiscalController } from '@/modules/fiscal/infra/http/FiscalController'
import { startFiscalWorker } from '@/modules/fiscal/application/workers/FiscalEmissionProcessor'
import { startFinanceWorker } from '@/modules/finance/application/workers/AccountDueWorker'
import { startIfoodWorker } from '@/modules/orders/application/workers/IfoodPollingWorker'
import { startProductAffinityWorker } from '@/modules/products/application/workers/ProductAffinityWorker'
import { startStockWorker } from '@/modules/products/application/workers/StockExpiryWorker'
import { startBullBoard } from '@/infra/queue/bullBoard'
import type { Worker } from 'bullmq'

// Uploads
import { LocalStorageProvider } from '@/shared/providers/LocalStorageProvider'
import { CachedProductLookup } from '@/shared/providers/CachedProductLookup'
import { OpenFoodFactsProvider } from '@/shared/providers/OpenFoodFactsProvider'
import { CachedRegionalPrice } from '@/shared/providers/CachedRegionalPrice'
import { PrecoDaHoraBahiaProvider } from '@/shared/providers/PrecoDaHoraBahiaProvider'
import { NominatimProvider } from '@/shared/providers/NominatimProvider'
import { UploadFileUseCase } from '@/modules/uploads/application/UploadFileUseCase'
import { UploadController } from '@/modules/uploads/infra/http/UploadController'

// WebSocket Hub (passed in from server bootstrap to avoid circular dep)
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'

export interface AppContainer {
  cache: RedisProvider
  menuController: MenuController
  catalogController: CatalogController
  sectionController: SectionController
  ingredientController: IngredientController
  stockBatchController: StockBatchController
  stockMovementController: StockMovementController
  authController: AuthController
  orderController: OrderController
  orderReferenceDataController: OrderReferenceDataController
  kitchenController: KitchenController
  deliveryController: DeliveryController
  cashierController: CashierController
  dashboardController: DashboardController
  reportsController: ReportsController
  settingsController: SettingsController
  deliveryFeeController: DeliveryFeeController
  webhookController: WebhookController
  customerController: CustomerController
  addressController: AddressController
  tableController: TableController
  staffController: StaffController
  roleController: RoleController
  conversationController: ConversationController
  whatsAppSettingsController: WhatsAppSettingsController
  fiscalController: FiscalController
  monthlyAccountController: MonthlyAccountController
  expenseController: ExpenseController
  uploadController: UploadController
  fiscalWorker?: Worker | undefined
  financeWorker?: Worker | undefined
  ifoodWorker?: Worker | undefined
  productAffinityWorker?: Worker | undefined
  stockWorker?: Worker | undefined
}

export function buildContainer(wsHub: WebSocketHub): AppContainer {
  const cache = new RedisProvider()

  // Uma instância do módulo por estabelecimento: os eventos que ele emite não carregam tenant.
  const metaWhatsAppModules = createMetaWhatsAppModuleRegistry({ db, cache, webSocketHub: wsHub })

  // Shared repos
  const userRepository = new DrizzleUserRepository(db)

  // Auth
  const loginUseCase = new LoginUseCase(userRepository, cache)
  const refreshTokenUseCase = new RefreshTokenUseCase(userRepository, cache)
  const logoutUseCase = new LogoutUseCase(cache)
  const changePasswordUseCase = new ChangePasswordUseCase(userRepository)
  const authController = new AuthController(loginUseCase, refreshTokenUseCase, logoutUseCase, changePasswordUseCase)

  // Shared use cases
  const findOrCreateCustomerUseCase = new FindOrCreateCustomerUseCase(db)
  const createAuditLogUseCase = new CreateAuditLogUseCase(db)

  // Products / Catalog
  // A ordem do array é a ordem de tentativa do fallback. Provider fiscal (T4.2) entra
  // depois da OpenFoodFacts quando houver contrato — sem mudar nada no controller.
  const productLookup = new CachedProductLookup(cache, [new OpenFoodFactsProvider()])

  // Preço regional tem cobertura por UF, não nacional: cada provider cobre um estado
  // e o resolver escolhe pelo estado do estabelecimento. UF sem provider → sem sugestão.
  const regionalPrice = new CachedRegionalPrice(cache, [
    new PrecoDaHoraBahiaProvider(new NominatimProvider()),
  ])

  const menuController = new MenuController(db, cache)
  const catalogController = new CatalogController(db, cache, productLookup, regionalPrice)
  const sectionController = new SectionController(db)
  const ingredientController = new IngredientController(db)
  const createStockBatchUseCase = new CreateStockBatchUseCase(db, createAuditLogUseCase)
  const stockBatchController = new StockBatchController(db, createStockBatchUseCase)
  const createStockMovementUseCase = new CreateStockMovementUseCase(db, createAuditLogUseCase)
  const stockMovementController = new StockMovementController(db, createStockMovementUseCase)
  const deductStockForOrderUseCase = new DeductStockForOrderUseCase(db)
  const triggerFiscalEmissionUseCase = new TriggerFiscalEmissionUseCase(db, wsHub)
  const updateOrderStatusUseCase = new UpdateOrderStatusUseCase(db, wsHub, triggerFiscalEmissionUseCase, deductStockForOrderUseCase)

  // Orders
  const botConfigRepository = new BotConfigRepository(db)
  const calculateDeliveryFeeUseCase = new CalculateDeliveryFeeUseCase(botConfigRepository, new NominatimProvider())
  const createOrderUseCase = new CreateOrderUseCase(db, wsHub, calculateDeliveryFeeUseCase)
  const updateOrderNotesUseCase = new UpdateOrderNotesUseCase(db)
  const getOrderUseCase = new GetOrderUseCase(db)
  const listOrdersUseCase = new ListOrdersUseCase(db)
  const listPaymentTypesUseCase = new ListPaymentTypesUseCase(botConfigRepository)
  const listOrderTypesUseCase = new ListOrderTypesUseCase(botConfigRepository)
  const orderReferenceDataController = new OrderReferenceDataController(
    listPaymentTypesUseCase,
    listOrderTypesUseCase
  )

  // Único caminho de envio ao cliente: o mesmo módulo que a inbox usa, só que atrás de uma
  // interface, para o módulo de pedidos não conhecer o registry.
  const customerMessages: CustomerMessageProvider = {
    async sendText(params): Promise<void> {
      await metaWhatsAppModules.forEstablishment(params.establishmentId).conversations.send.sendText({
        companyId: params.establishmentId,
        whatsappNumber: params.whatsappNumber,
        body: params.body,
        sender: CONVERSATION_AGENT_SENDER,
        agentUserId: params.agentUserId,
        startState: CONVERSATION_START_STATE,
      })
    },
  }

  const requestPartialOrderConfirmationUseCase = new RequestPartialOrderConfirmationUseCase(
    db,
    customerMessages,
    createAuditLogUseCase
  )
  const orderController = new OrderController(
    createOrderUseCase,
    updateOrderStatusUseCase,
    updateOrderNotesUseCase,
    getOrderUseCase,
    listOrdersUseCase,
    requestPartialOrderConfirmationUseCase
  )

  // Kitchen
  const getKitchenQueueUseCase = new GetKitchenQueueUseCase(db)
  const markOrderItemReadyUseCase = new MarkOrderItemReadyUseCase(db, updateOrderStatusUseCase)
  const kitchenController = new KitchenController(
    getKitchenQueueUseCase,
    updateOrderStatusUseCase,
    markOrderItemReadyUseCase
  )

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
  const addCashMovementUseCase = new AddCashMovementUseCase(db, triggerFiscalEmissionUseCase)
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
  const getFunnelAnalysisUseCase = new GetFunnelAnalysisUseCase(db)
  const getTableMetricsUseCase = new GetTableMetricsUseCase(db)
  const getIngredientsRankingUseCase = new GetIngredientsRankingUseCase(db)
  const getProductProfitUseCase = new GetProductProfitUseCase(db)
  const getPreparationTimeComparisonUseCase = new GetPreparationTimeComparisonUseCase(db)
  const reportsController = new ReportsController(
    exportOrdersCSVUseCase,
    getMonthlyReportUseCase,
    getFunnelAnalysisUseCase,
    getTableMetricsUseCase,
    getIngredientsRankingUseCase,
    getProductProfitUseCase,
    getPreparationTimeComparisonUseCase
  )

  // Settings
  const getSettingsUseCase = new GetSettingsUseCase(db)
  const upsertSettingUseCase = new UpsertSettingUseCase(db)
  const settingsController = new SettingsController(getSettingsUseCase, upsertSettingUseCase)
  const deliveryFeeController = new DeliveryFeeController()

  // Webhook — assinatura, replay e persistência ficam no módulo
  const webhookController = new WebhookController(metaWhatsAppModules)

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

  // Addresses
  const addressRepository = new DrizzleAddressRepository(db)
  const listAddressesUseCase = new ListAddressesUseCase(addressRepository)
  const createAddressUseCase = new CreateAddressUseCase(addressRepository)
  const updateAddressUseCase = new UpdateAddressUseCase(addressRepository)
  const deleteAddressUseCase = new DeleteAddressUseCase(addressRepository)
  const setDefaultAddressUseCase = new SetDefaultAddressUseCase(addressRepository)
  const addressController = new AddressController(
    listAddressesUseCase,
    createAddressUseCase,
    updateAddressUseCase,
    deleteAddressUseCase,
    setDefaultAddressUseCase
  )

  // Tables + Comanda
  const tableRepository = new DrizzleTableRepository(db)
  const comandaRepository = new DrizzleComandaRepository(db)
  const listTablesUseCase = new ListTablesUseCase(tableRepository)
  const createTableUseCase = new CreateTableUseCase(tableRepository)
  const updateTableUseCase = new UpdateTableUseCase(tableRepository)
  const updateTablePositionUseCase = new UpdateTablePositionUseCase(tableRepository, createAuditLogUseCase)
  const deleteTableUseCase = new DeleteTableUseCase(tableRepository)
  const groupTablesUseCase = new GroupTablesUseCase(db, tableRepository, createAuditLogUseCase)
  const ungroupTablesUseCase = new UngroupTablesUseCase(db, createAuditLogUseCase)
  const openComandaUseCase = new OpenComandaUseCase(tableRepository, comandaRepository)
  const closeComandaUseCase = new CloseComandaUseCase(tableRepository, comandaRepository)
  const getComandaByCodeUseCase = new GetComandaByCodeUseCase(comandaRepository)
  const listComandasByTableUseCase = new ListComandasByTableUseCase(tableRepository, comandaRepository)
  const confirmComandaUseCase = new ConfirmComandaUseCase(comandaRepository)
  const tableController = new TableController(
    listTablesUseCase,
    createTableUseCase,
    updateTableUseCase,
    updateTablePositionUseCase,
    deleteTableUseCase,
    groupTablesUseCase,
    ungroupTablesUseCase,
    openComandaUseCase,
    closeComandaUseCase,
    getComandaByCodeUseCase,
    listComandasByTableUseCase,
    confirmComandaUseCase,
    comandaRepository
  )

  // Conversations
  const conversationController = new ConversationController(metaWhatsAppModules)
  const whatsAppSettingsController = new WhatsAppSettingsController(
    metaWhatsAppModules,
    new WhatsAppTemplateProvider({
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
      ...(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
        ? { wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID }
        : {}),
      ...(process.env.WHATSAPP_API_VERSION ? { apiVersion: process.env.WHATSAPP_API_VERSION } : {}),
    })
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

  // Roles
  const createRoleUseCase = new CreateRoleUseCase(staffRepository)
  const updateRoleUseCase = new UpdateRoleUseCase(staffRepository)
  const deleteRoleUseCase = new DeleteRoleUseCase(staffRepository)
  const getRoleWithPermissionsUseCase = new GetRoleWithPermissionsUseCase(staffRepository)
  const listRolesWithPermissionsUseCase = new ListRolesWithPermissionsUseCase(staffRepository)
  const assignPermissionsUseCase = new AssignPermissionsUseCase(staffRepository)
  const roleController = new RoleController(
    listRolesWithPermissionsUseCase,
    getRoleWithPermissionsUseCase,
    createRoleUseCase,
    updateRoleUseCase,
    deleteRoleUseCase,
    assignPermissionsUseCase
  )

  // Fiscal
  const emitFiscalDocumentUseCase = new EmitFiscalDocumentUseCase(db, wsHub)
  const cancelFiscalDocumentUseCase = new CancelFiscalDocumentUseCase(db, wsHub)
  const getFiscalDocumentUseCase = new GetFiscalDocumentUseCase(db)
  const upsertFiscalConfigUseCase = new UpsertFiscalConfigUseCase(db)
  const testFiscalConnectionUseCase = new TestFiscalConnectionUseCase()
  const retryFiscalDocumentUseCase = new RetryFiscalDocumentUseCase(db, wsHub)
  const printFiscalCupomUseCase = new PrintFiscalCupomUseCase(db, new ThermalPrinterProvider())
  const generateFiscalPdfUseCase = new GenerateFiscalPdfUseCase(db)

  // Fiscal
  const fiscalController = new FiscalController(
    emitFiscalDocumentUseCase,
    cancelFiscalDocumentUseCase,
    getFiscalDocumentUseCase,
    upsertFiscalConfigUseCase,
    testFiscalConnectionUseCase,
    retryFiscalDocumentUseCase,
    printFiscalCupomUseCase,
    generateFiscalPdfUseCase
  )

  // Uploads
  const storageProvider = new LocalStorageProvider()
  const uploadFileUseCase = new UploadFileUseCase(storageProvider)
  const uploadController = new UploadController(uploadFileUseCase)

  // Finance
  const monthlyAccountController = new MonthlyAccountController(db)
  const expenseController = new ExpenseController(db, uploadFileUseCase)

  // Fiscal emission worker — opt-in per environment (consumes the BullMQ fiscal queue)
  const fiscalWorker = process.env.FISCAL_WORKER_ENABLED === 'true'
    ? startFiscalWorker({ database: db, websocketHub: wsHub })
    : undefined
  if (fiscalWorker) {
    console.log('[API] Fiscal worker started')
    startBullBoard()
  }

  const financeWorker = process.env.FINANCE_WORKER_ENABLED === 'true'
    ? startFinanceWorker(db)
    : undefined
  if (financeWorker) {
    console.log('[API] Finance worker started')
    startBullBoard()
  }

  const ifoodWorker = process.env.IFOOD_ENABLED === 'true'
    ? startIfoodWorker(db, createOrderUseCase, updateOrderStatusUseCase)
    : undefined
  if (ifoodWorker) {
    console.log('[API] iFood polling worker started')
    startBullBoard()
  }

  const productAffinityWorker = process.env.PRODUCT_AFFINITY_WORKER_ENABLED === 'true'
    ? startProductAffinityWorker(db)
    : undefined
  if (productAffinityWorker) {
    console.log('[API] Product affinity worker started')
    startBullBoard()
  }

  const stockWorker = process.env.STOCK_WORKER_ENABLED === 'true'
    ? startStockWorker(db)
    : undefined
  if (stockWorker) {
    console.log('[API] Stock expiry worker started')
    startBullBoard()
  }

  return {
    fiscalWorker,
    financeWorker,
    ifoodWorker,
    productAffinityWorker,
    stockWorker,
    cache,
    menuController,
    catalogController,
    sectionController,
    ingredientController,
    stockBatchController,
    stockMovementController,
    authController,
    orderController,
    orderReferenceDataController,
    kitchenController,
    deliveryController,
    cashierController,
    dashboardController,
    reportsController,
    settingsController,
    deliveryFeeController,
    webhookController,
    customerController,
    addressController,
    tableController,
    staffController,
    roleController,
    conversationController,
    whatsAppSettingsController,
    fiscalController,
    monthlyAccountController,
    expenseController,
    uploadController,
  }
}
