import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type {
  StaffRepository,
  StaffMember,
  CreateStaffInput,
  UpdateStaffInput,
  StaffRole,
} from '../../domain/repositories/StaffRepository'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

export class DrizzleStaffRepository implements StaffRepository {
  constructor(private readonly db: Database) {}

  async listByEstablishment(establishmentId: string): Promise<StaffMember[]> {
    const rows = await this.db.query.users.findMany({
      where: eq(schema.users.establishmentId, establishmentId),
      with: { role: true },
      orderBy: schema.users.name,
    })

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      roleId: row.roleId,
      roleName: row.role.name,
      active: row.active,
      passwordMustChange: row.passwordMustChange,
      createdAt: row.createdAt,
    }))
  }

  async findById(id: string, establishmentId: string): Promise<StaffMember | null> {
    const row = await this.db.query.users.findFirst({
      where: and(eq(schema.users.id, id), eq(schema.users.establishmentId, establishmentId)),
      with: { role: true },
    })

    if (!row) return null

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      roleId: row.roleId,
      roleName: row.role.name,
      active: row.active,
      passwordMustChange: row.passwordMustChange,
      createdAt: row.createdAt,
    }
  }

  async findByEmail(email: string): Promise<{ id: string } | null> {
    const row = await this.db.query.users.findFirst({
      where: eq(schema.users.email, email),
      columns: { id: true },
    })
    return row ?? null
  }

  async create(input: CreateStaffInput): Promise<StaffMember> {
    const [row] = await this.db
      .insert(schema.users)
      .values({
        establishmentId: input.establishmentId,
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        roleId: input.roleId,
        passwordMustChange: true,
      })
      .returning()

    if (!row) throw new Error('Failed to create staff member')

    const role = await this.db.query.roles.findFirst({
      where: eq(schema.roles.id, row.roleId),
    })

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      roleId: row.roleId,
      roleName: role?.name ?? '',
      active: row.active,
      passwordMustChange: row.passwordMustChange,
      createdAt: row.createdAt,
    }
  }

  async update(id: string, establishmentId: string, input: UpdateStaffInput): Promise<StaffMember> {
    const now = new Date()

    await this.db
      .update(schema.users)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.roleId !== undefined && { roleId: input.roleId }),
        updatedAt: now,
      })
      .where(and(eq(schema.users.id, id), eq(schema.users.establishmentId, establishmentId)))

    const updated = await this.findById(id, establishmentId)
    if (!updated) throw new Error('Staff member not found after update')
    return updated
  }

  async toggleActive(id: string, establishmentId: string): Promise<StaffMember> {
    const existing = await this.findById(id, establishmentId)
    if (!existing) throw new Error('Staff member not found')

    await this.db
      .update(schema.users)
      .set({ active: !existing.active, updatedAt: new Date() })
      .where(and(eq(schema.users.id, id), eq(schema.users.establishmentId, establishmentId)))

    return { ...existing, active: !existing.active }
  }

  async resetPassword(id: string, establishmentId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ passwordHash, passwordMustChange: true, updatedAt: new Date() })
      .where(and(eq(schema.users.id, id), eq(schema.users.establishmentId, establishmentId)))
  }

  async delete(id: string, establishmentId: string): Promise<void> {
    await this.db
      .delete(schema.users)
      .where(and(eq(schema.users.id, id), eq(schema.users.establishmentId, establishmentId)))
  }

  async listRoles(establishmentId: string): Promise<StaffRole[]> {
    const rows = await this.db.query.roles.findMany({
      where: eq(schema.roles.establishmentId, establishmentId),
      orderBy: schema.roles.name,
    })

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
    }))
  }
}
