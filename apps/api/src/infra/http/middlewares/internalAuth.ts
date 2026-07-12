import type { Middleware } from '../router'
import { UnauthorizedError } from '@/shared/errors/AppError'

const INTERNAL_API_TOKEN = process.env.N8N_INTERNAL_API_TOKEN ?? 'change-internal-token'

export const internalAuth: Middleware = async (request, _response, next) => {
  const token = request.headers['x-internal-token']

  if (!token || token !== INTERNAL_API_TOKEN) {
    throw new UnauthorizedError('invalid_internal_token')
  }

  await next()
}
