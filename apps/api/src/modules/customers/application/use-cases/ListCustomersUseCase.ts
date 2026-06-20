import type { CustomerRepository, CustomerWithStats } from '../../domain/repositories/CustomerRepository'

interface ListCustomersInput {
  establishmentId: string
  page?: number
  pageSize?: number
  search?: string
}

interface ListCustomersOutput {
  data: CustomerWithStats[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export class ListCustomersUseCase {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async execute(input: ListCustomersInput): Promise<ListCustomersOutput> {
    return this.customerRepository.listByEstablishment(
      input.establishmentId,
      input.page ?? 1,
      input.pageSize ?? 20,
      input.search
    )
  }
}
