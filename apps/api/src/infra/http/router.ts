import { randomUUID } from 'crypto'
import type { AuthenticatedUser } from '@/shared/types'
import { MetaWhatsAppError } from '@adatechnology/meta-whatsapp-contracts'
import { AppError } from '@/shared/errors/AppError'

export interface ParsedRequest {
  method: string
  url: string
  params: Record<string, string>
  query: Record<string, string>
  headers: Record<string, string>
  body: unknown
  rawBody: Buffer
  user?: AuthenticatedUser
  establishmentId?: string
}

export interface ResponseHelper {
  json(data: unknown, statusCode?: number): void
  error(code: string, message: string, statusCode?: number, details?: unknown): void
  binary(body: Buffer, contentType: string, fileName?: string, statusCode?: number): void
  readonly sent: boolean
  readonly requestId: string
}

export type Middleware = (
  request: ParsedRequest,
  response: ResponseHelper,
  next: () => Promise<void>
) => Promise<void>

export type RouteHandler = (request: ParsedRequest, response: ResponseHelper) => Promise<void>

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH'])

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',')

const SECURITY_HEADERS: Array<[string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['X-XSS-Protection', '0'],
]

export function corsAndSecurityHeaders(origin: string): Headers {
  const headers = new Headers()
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
  }
  for (const [name, value] of SECURITY_HEADERS) {
    headers.set(name, value)
  }
  return headers
}

function extractParamNames(pattern: string): string[] {
  const matches = pattern.match(/:([^/]+)/g) ?? []
  return matches.map((match) => match.slice(1))
}

function compilePattern(pattern: string): RegExp {
  const escaped = pattern
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? '([^/]+)' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('/')
  return new RegExp(`^${escaped}$`)
}

function buildResponseHelper(
  origin: string,
  requestId: string,
  resolve: (response: Response) => void
): ResponseHelper {
  let sent = false

  function buildHeaders(
    contentType: string,
    extraHeaders?: Record<string, string>
  ): Headers {
    const headers = corsAndSecurityHeaders(origin)
    headers.set('Content-Type', contentType)
    headers.set('X-Request-Id', requestId)
    if (extraHeaders) {
      for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value)
    }
    return headers
  }

  return {
    get sent() {
      return sent
    },

    get requestId() {
      return requestId
    },

    json(data: unknown, statusCode = 200): void {
      if (sent) return
      sent = true
      const headers = buildHeaders('application/json')
      resolve(new Response(JSON.stringify(data), { status: statusCode, headers }))
    },

    error(code: string, message: string, statusCode = 500, details?: unknown): void {
      if (sent) return
      sent = true
      const payload: Record<string, unknown> = { error: code, message }
      if (details !== undefined) payload.details = details
      const headers = buildHeaders('application/json')
      resolve(new Response(JSON.stringify(payload), { status: statusCode, headers }))
    },

    binary(body: Buffer, contentType: string, fileName?: string, statusCode = 200): void {
      if (sent) return
      sent = true
      const extraHeaders = fileName
        ? { 'Content-Disposition': `attachment; filename="${fileName}"` }
        : undefined
      const headers = buildHeaders(contentType, extraHeaders)
      resolve(new Response(body, { status: statusCode, headers }))
    },
  }
}

async function runMiddlewareChain(
  middlewares: Middleware[],
  handler: RouteHandler,
  request: ParsedRequest,
  response: ResponseHelper
): Promise<void> {
  let index = 0

  async function next(): Promise<void> {
    if (index < middlewares.length) {
      const middleware = middlewares[index]
      index += 1
      if (!middleware) return
      await middleware(request, response, next)
    } else {
      await handler(request, response)
    }
  }

  await next()
}

interface RouteEntry {
  method: string
  regex: RegExp
  paramNames: string[]
  middlewares: Middleware[]
  handler: RouteHandler
}

export class Router {
  private readonly routes: RouteEntry[] = []

  private register(
    method: string,
    pattern: string,
    middlewares: Middleware[],
    handler: RouteHandler
  ): void {
    this.routes.push({
      method,
      regex: compilePattern(pattern),
      paramNames: extractParamNames(pattern),
      middlewares,
      handler,
    })
  }

  private matchRoute(
    method: string,
    pathname: string
  ): { route: RouteEntry; params: Record<string, string> } | undefined {
    for (const route of this.routes) {
      if (route.method !== method) continue
      const match = route.regex.exec(pathname)
      if (!match) continue
      const params: Record<string, string> = {}
      route.paramNames.forEach((name, index) => {
        params[name] = decodeURIComponent(match[index + 1] ?? '')
      })
      return { route, params }
    }
    return undefined
  }

  // Returns undefined when no registered route matches — caller falls through to its own 404.
  async handle(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url)
    const httpMethod = request.method.toUpperCase()
    const origin = request.headers.get('origin') ?? ''

    const matched = this.matchRoute(httpMethod, url.pathname)
    if (!matched) return undefined

    const { route, params } = matched
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    return new Promise<Response>((resolve) => {
      const response = buildResponseHelper(origin, randomUUID(), resolve)

      void (async () => {
        let rawBody = Buffer.alloc(0)
        let body: unknown = undefined

        if (METHODS_WITH_BODY.has(httpMethod)) {
          try {
            rawBody = Buffer.from(await request.arrayBuffer())
          } catch {
            return // request aborted before body finished
          }
          if (rawBody.length > 0) {
            const contentType = headers['content-type'] ?? ''
            if (contentType.includes('application/json')) {
              try {
                body = JSON.parse(rawBody.toString('utf-8'))
              } catch {
                response.error('invalid_json', 'Request body is not valid JSON', 400)
                return
              }
            }
          }
        }

        const parsedRequest: ParsedRequest = {
          method: httpMethod,
          url: url.pathname,
          params,
          query: Object.fromEntries(url.searchParams),
          headers,
          body,
          rawBody,
        }

        try {
          await runMiddlewareChain(route.middlewares, route.handler, parsedRequest, response)
        } catch (error) {
          if (response.sent) return
          if (error instanceof AppError) {
            response.error(error.code, error.message, error.statusCode, error.details)
          } else if (error instanceof MetaWhatsAppError) {
            // O módulo tem a própria hierarquia e já carrega status e código estáveis; sem esta
            // ponte, assinatura inválida e janela de 24h expirada viravam 500 `internal_error`.
            response.error(error.code, error.message, error.statusCode, error.details)
          } else {
            const message =
              error instanceof Error ? error.message : 'An unexpected error occurred'
            response.error('internal_error', message, 500)
          }
        }
      })()
    })
  }

  private resolveArgs(args: Array<Middleware | RouteHandler>): {
    middlewares: Middleware[]
    handler: RouteHandler
  } {
    const handler = args[args.length - 1] as RouteHandler
    const middlewares = args.slice(0, -1) as Middleware[]
    return { middlewares, handler }
  }

  get(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('GET', pattern, middlewares, handler)
  }

  post(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('POST', pattern, middlewares, handler)
  }

  put(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('PUT', pattern, middlewares, handler)
  }

  patch(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('PATCH', pattern, middlewares, handler)
  }

  delete(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('DELETE', pattern, middlewares, handler)
  }

  options(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('OPTIONS', pattern, middlewares, handler)
  }

  head(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('HEAD', pattern, middlewares, handler)
  }
}
