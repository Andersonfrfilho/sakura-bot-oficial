import type { Customer, Order } from '@/infra/database/schema'

export interface CustomerWithStats extends Customer {
  orderCount: number
  totalSpent: string
  lastOrderAt: string | null
}

export interface CustomerDetails {
  customer: Customer
  stats: {
    orderCount: number
    totalSpent: string
    lastOrderAt: string | null
    firstOrderAt: string | null
  }
  recentOrders: Array<Pick<Order, 'id' | 'status' | 'totalAmount' | 'channel' | 'type' | 'receivedAt'>>
}

export interface CreateCustomerInput {
  establishmentId: string
  name: string
  whatsappNumber: string
  phone?: string
  document?: string
  birthDate?: string
}

export interface UpdateCustomerInput {
  name?: string
  phone?: string
  document?: string
  birthDate?: string | null
}

export interface CustomerRepository {
  listByEstablishment(
    establishmentId: string,
    page?: number,
    pageSize?: number,
    search?: string
  ): Promise<{
    data: CustomerWithStats[]
    total: number
    page: number
    pageSize: number
    totalPages: number
  }>
  findById(id: string, establishmentId: string): Promise<Customer | null>
  findByWhatsApp(whatsappNumber: string, establishmentId: string): Promise<Customer | null>
  getDetails(id: string, establishmentId: string): Promise<CustomerDetails | null>
  create(input: CreateCustomerInput): Promise<Customer>
  update(id: string, establishmentId: string, input: UpdateCustomerInput): Promise<Customer>
  delete(id: string, establishmentId: string): Promise<void>
}
