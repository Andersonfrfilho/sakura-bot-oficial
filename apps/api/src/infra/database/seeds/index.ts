import { db } from '../connection'
import * as schema from '../schema'
import argon2 from 'argon2'

const DEFAULT_ESTABLISHMENT = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Restaurante Demo',
  whatsappNumber: '5511999999999',
}

const DEFAULT_ROLES = [
  {
    id: '00000000-0000-0000-0001-000000000001',
    establishmentId: DEFAULT_ESTABLISHMENT.id,
    name: 'Administrador',
  },
  {
    id: '00000000-0000-0000-0001-000000000002',
    establishmentId: DEFAULT_ESTABLISHMENT.id,
    name: 'Gerente',
  },
  {
    id: '00000000-0000-0000-0001-000000000003',
    establishmentId: DEFAULT_ESTABLISHMENT.id,
    name: 'Caixa',
  },
  {
    id: '00000000-0000-0000-0001-000000000004',
    establishmentId: DEFAULT_ESTABLISHMENT.id,
    name: 'Cozinha',
  },
  {
    id: '00000000-0000-0000-0001-000000000005',
    establishmentId: DEFAULT_ESTABLISHMENT.id,
    name: 'Entregador',
  },
  {
    id: '00000000-0000-0000-0001-000000000006',
    establishmentId: DEFAULT_ESTABLISHMENT.id,
    name: 'Atendente',
  },
]

const ALL_RESOURCES = ['orders', 'kitchen', 'cashier', 'delivery', 'users', 'products', 'reports', 'settings'] as const
const ALL_ACTIONS = ['read', 'write', 'delete', 'manage'] as const

// Admin gets all permissions
const ADMIN_PERMISSIONS = ALL_RESOURCES.flatMap((resource) =>
  ALL_ACTIONS.map((action) => ({
    roleId: '00000000-0000-0000-0001-000000000001',
    resource,
    action,
  }))
)

const ROLE_PERMISSIONS = [
  // Gerente: all except manage users/settings
  ...['orders', 'kitchen', 'cashier', 'delivery', 'products', 'reports'].flatMap((resource) =>
    ['read', 'write', 'delete'].map((action) => ({
      roleId: '00000000-0000-0000-0001-000000000002',
      resource,
      action,
    }))
  ),
  // Caixa
  { roleId: '00000000-0000-0000-0001-000000000003', resource: 'cashier', action: 'read' },
  { roleId: '00000000-0000-0000-0001-000000000003', resource: 'cashier', action: 'write' },
  { roleId: '00000000-0000-0000-0001-000000000003', resource: 'orders', action: 'read' },
  // Cozinha
  { roleId: '00000000-0000-0000-0001-000000000004', resource: 'kitchen', action: 'read' },
  { roleId: '00000000-0000-0000-0001-000000000004', resource: 'kitchen', action: 'write' },
  { roleId: '00000000-0000-0000-0001-000000000004', resource: 'orders', action: 'read' },
  // Entregador
  { roleId: '00000000-0000-0000-0001-000000000005', resource: 'delivery', action: 'read' },
  { roleId: '00000000-0000-0000-0001-000000000005', resource: 'delivery', action: 'write' },
  { roleId: '00000000-0000-0000-0001-000000000005', resource: 'orders', action: 'read' },
  // Atendente
  { roleId: '00000000-0000-0000-0001-000000000006', resource: 'orders', action: 'read' },
  { roleId: '00000000-0000-0000-0001-000000000006', resource: 'orders', action: 'write' },
]

async function seed() {
  console.log('[Seed] Starting...')

  await db
    .insert(schema.establishments)
    .values(DEFAULT_ESTABLISHMENT)
    .onConflictDoNothing()

  // Ensure establishment exists before roles (FK constraint)
  const estab = await db.query.establishments.findFirst({
    where: (e, { eq }) => eq(e.id, DEFAULT_ESTABLISHMENT.id),
  })
  if (!estab) {
    throw new Error(`Establishment ${DEFAULT_ESTABLISHMENT.id} not found after insert`)
  }

  await db.insert(schema.roles).values(DEFAULT_ROLES).onConflictDoNothing()

  const allPermissions = [...ADMIN_PERMISSIONS, ...ROLE_PERMISSIONS]
  await db.insert(schema.permissions).values(allPermissions).onConflictDoNothing()

  // Default admin user: admin@orderhub.io / Admin@123
  const passwordHash = await argon2.hash('Admin@123')

  await db
    .insert(schema.users)
    .values({
      id: '00000000-0000-0000-0002-000000000001',
      establishmentId: DEFAULT_ESTABLISHMENT.id,
      roleId: '00000000-0000-0000-0001-000000000001',
      name: 'Admin',
      email: 'admin@orderhub.io',
      passwordHash,
      active: true,
      passwordMustChange: true,
    })
    .onConflictDoNothing()

  console.log('[Seed] Done.')
  process.exit(0)
}

seed().catch((error) => {
  console.error('[Seed] Error:', error)
  process.exit(1)
})
