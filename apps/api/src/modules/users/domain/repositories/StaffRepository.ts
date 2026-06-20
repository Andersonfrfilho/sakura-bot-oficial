export interface StaffMember {
  id: string
  name: string
  email: string
  roleId: string
  roleName: string
  active: boolean
  passwordMustChange: boolean
  createdAt: Date
}

export interface CreateStaffInput {
  establishmentId: string
  name: string
  email: string
  passwordHash: string
  roleId: string
}

export interface UpdateStaffInput {
  name?: string
  email?: string
  roleId?: string
}

export interface StaffRole {
  id: string
  name: string
  description: string | null
}

export interface StaffRepository {
  listByEstablishment(establishmentId: string): Promise<StaffMember[]>
  findById(id: string, establishmentId: string): Promise<StaffMember | null>
  findByEmail(email: string): Promise<{ id: string } | null>
  create(input: CreateStaffInput): Promise<StaffMember>
  update(id: string, establishmentId: string, input: UpdateStaffInput): Promise<StaffMember>
  toggleActive(id: string, establishmentId: string): Promise<StaffMember>
  resetPassword(id: string, establishmentId: string, passwordHash: string): Promise<void>
  delete(id: string, establishmentId: string): Promise<void>
  listRoles(establishmentId: string): Promise<StaffRole[]>
}
