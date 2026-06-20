import type { RouteHandler } from '@/infra/http/router'
import type { ExportOrdersCSVUseCase } from '../../application/use-cases/ExportOrdersCSVUseCase'
import type { GetMonthlyReportUseCase } from '../../application/use-cases/GetMonthlyReportUseCase'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'

export class ReportsController {
  constructor(
    private readonly exportOrdersCSVUseCase: ExportOrdersCSVUseCase,
    private readonly getMonthlyReportUseCase: GetMonthlyReportUseCase
  ) {}

  exportOrders: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const { from, to } = request.query
    if (!from || !to) {
      throw new ValidationError('Query params `from` and `to` are required')
    }

    const fromDate = new Date(from)
    const toDate = new Date(to)

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new ValidationError('Invalid date format. Use ISO 8601.')
    }

    const csv = await this.exportOrdersCSVUseCase.execute({
      establishmentId: request.user.establishmentId,
      from: fromDate,
      to: toDate,
    })

    const filename = `orders-${from}-${to}.csv`
    response.json({ csv, filename })
  }

  getMonthlyReport: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()

    const { year, month } = request.query

    const yearNum = year ? parseInt(year) : new Date().getFullYear()
    const monthNum = month ? parseInt(month) : new Date().getMonth() + 1

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new ValidationError('Parâmetros year e month inválidos')
    }

    const report = await this.getMonthlyReportUseCase.execute({
      establishmentId: request.user.establishmentId,
      year: yearNum,
      month: monthNum,
    })

    response.json(report)
  }
}
