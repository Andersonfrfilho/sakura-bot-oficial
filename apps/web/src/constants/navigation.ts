export const ROLES = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  CASHIER: 'Caixa',
  KITCHEN: 'Cozinha',
  DELIVERY: 'Entregador',
  ATTENDANT: 'Atendente',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

interface NavItem {
  to: string
  label: string
  roles?: Role[]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/kitchen', label: 'Cozinha', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN] },
  { to: '/delivery', label: 'Entregas', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.DELIVERY] },
  { to: '/cashier', label: 'Caixa', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.CASHIER] },
  { to: '/orders', label: 'Pedidos', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT] },
  { to: '/tables', label: 'Mesas', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT] },
  { to: '/customers', label: 'Clientes', roles: [ROLES.ADMIN, ROLES.MANAGER] },
  { to: '/staff', label: 'Funcionários', roles: [ROLES.ADMIN, ROLES.MANAGER] },
  { to: '/catalog', label: 'Cardápio', roles: [ROLES.ADMIN, ROLES.MANAGER] },
  { to: '/reports', label: 'Relatórios', roles: [ROLES.ADMIN, ROLES.MANAGER] },
  { to: '/settings', label: 'Configurações', roles: [ROLES.ADMIN, ROLES.MANAGER] },
]
