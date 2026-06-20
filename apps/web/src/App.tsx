import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { KitchenPage } from '@/pages/kitchen/KitchenPage'
import { DeliveryPage } from '@/pages/delivery/DeliveryPage'
import { CashierPage } from '@/pages/cashier/CashierPage'
import { OrdersPage } from '@/pages/orders/OrdersPage'
import { CustomersPage } from '@/pages/customers/CustomersPage'
import { TablesPage } from '@/pages/tables/TablesPage'
import { StaffPage } from '@/pages/staff/StaffPage'
import { CatalogPage } from '@/pages/catalog/CatalogPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage'
import { ComandaConfirmPage } from '@/pages/comanda/ComandaConfirmPage'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { AuthGuard, RoleGuard } from '@/components/layout/RoleGuard'
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner'
import { ROLES } from '@/constants/navigation'

function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <MobileNav />
      <Sidebar />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route
            path="/kitchen"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN]}>
                <KitchenPage />
              </RoleGuard>
            }
          />
          <Route
            path="/delivery"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.DELIVERY]}>
                <DeliveryPage />
              </RoleGuard>
            }
          />
          <Route
            path="/cashier"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.CASHIER]}>
                <CashierPage />
              </RoleGuard>
            }
          />
          <Route
            path="/orders"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT]}>
                <OrdersPage />
              </RoleGuard>
            }
          />
          <Route
            path="/tables"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT]}>
                <TablesPage />
              </RoleGuard>
            }
          />
          <Route
            path="/customers"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <CustomersPage />
              </RoleGuard>
            }
          />
          <Route
            path="/staff"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <StaffPage />
              </RoleGuard>
            }
          />
          <Route
            path="/catalog"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <CatalogPage />
              </RoleGuard>
            }
          />
          <Route
            path="/reports"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <ReportsPage />
              </RoleGuard>
            }
          />
          <Route
            path="/settings"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <SettingsPage />
              </RoleGuard>
            }
          />
        </Route>

        {/* Rota pública — sem autenticação */}
        <Route path="/comanda/:code" element={<ComandaConfirmPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <PWAInstallBanner />
    </BrowserRouter>
  )
}
