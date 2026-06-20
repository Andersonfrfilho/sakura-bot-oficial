import { randomUUID } from 'crypto'
import type { TemplatedApp, HttpResponse, HttpRequest } from 'uWebSockets.js'
import type { AuthenticatedUser } from '@/shared/types'
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
  readonly sent: boolean
  readonly requestId: string
}

export type Middleware = (
  request: ParsedRequest,
  response: ResponseHelper,
  next: () => Promise<void>
) => Promise<void>

export type RouteHandler = (request: ParsedRequest, response: ResponseHelper) => Promise<void>

const HTTP_STATUS: Record<number, string> = {
  200: '200 OK',
  201: '201 Created',
  204: '204 No Content',
  400: '400 Bad Request',
  401: '401 Unauthorized',
  403: '403 Forbidden',
  404: '404 Not Found',
  409: '409 Conflict',
  422: '422 Unprocessable Entity',
  423: '423 Locked',
  429: '429 Too Many Requests',
  500: '500 Internal Server Error',
  503: '503 Service Unavailable',
}

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH'])

function extractParamNames(pattern: string): string[] {
  const matches = pattern.match(/:([^/]+)/g) ?? []
  return matches.map((match) => match.slice(1))
}

function parseQueryString(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!raw) return result
  try {
    new URLSearchParams(raw).forEach((value, key) => {
      result[key] = value
    })
  } catch {
    // malformed query string
  }
  return result
}

function setupBodyReader(
  uwsResponse: HttpResponse,
  hasBody: boolean
): { bodyPromise: Promise<Buffer>; isAborted: () => boolean } {
  let aborted = false
  let resolveBody!: (value: Buffer) => void
  let rejectBody!: (reason: unknown) => void

  const bodyPromise = new Promise<Buffer>((resolve, reject) => {
    resolveBody = resolve
    rejectBody = reject
  })

  // onAborted must be set synchronously
  uwsResponse.onAborted(() => {
    aborted = true
    rejectBody(new Error('Request aborted'))
  })

  if (hasBody) {
    const chunks: Buffer[] = []
    uwsResponse.onData((chunk: ArrayBuffer, isLast: boolean) => {
      chunks.push(Buffer.from(chunk))
      if (isLast) resolveBody(Buffer.concat(chunks))
    })
  } else {
    resolveBody(Buffer.alloc(0))
  }

  return { bodyPromise, isAborted: () => aborted }
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',')

const SECURITY_HEADERS: Array<[string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['X-XSS-Protection', '0'],
]

function buildResponseHelper(
  uwsResponse: HttpResponse,
  isAborted: () => boolean,
  origin: string
): ResponseHelper {
  let sent = false
  const reqId = randomUUID()

  function writeCommonHeaders(status: string): void {
    uwsResponse.writeStatus(status)
    uwsResponse.writeHeader('Content-Type', 'application/json')
    uwsResponse.writeHeader('X-Request-Id', reqId)
    if (ALLOWED_ORIGINS.includes(origin)) {
      uwsResponse.writeHeader('Access-Control-Allow-Origin', origin)
    }
    for (const [name, value] of SECURITY_HEADERS) {
      uwsResponse.writeHeader(name, value)
    }
  }

  return {
    get sent() {
      return sent
    },

    get requestId() {
      return reqId
    },

    json(data: unknown, statusCode = 200): void {
      if (sent || isAborted()) return
      sent = true
      const body = JSON.stringify(data)
      uwsResponse.cork(() => {
        writeCommonHeaders(HTTP_STATUS[statusCode] ?? String(statusCode))
        uwsResponse.end(body)
      })
    },

    error(code: string, message: string, statusCode = 500, details?: unknown): void {
      if (sent || isAborted()) return
      sent = true
      const payload: Record<string, unknown> = { error: code, message }
      if (details !== undefined) payload.details = details
      const body = JSON.stringify(payload)
      uwsResponse.cork(() => {
        writeCommonHeaders(HTTP_STATUS[statusCode] ?? String(statusCode))
        uwsResponse.end(body)
      })
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
      const middleware = middlewares[index++]
      await middleware(request, response, next)
    } else {
      await handler(request, response)
    }
  }

  await next()
}

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'del' | 'options' | 'head'

export class Router {
  private readonly app: TemplatedApp

  constructor(app: TemplatedApp) {
    this.app = app
  }

  private register(
    method: HttpMethod,
    pattern: string,
    middlewares: Middleware[],
    handler: RouteHandler
  ): void {
    const paramNames = extractParamNames(pattern)

    this.app[method](pattern, (uwsResponse: HttpResponse, uwsRequest: HttpRequest) => {
      // Extract ALL sync data from uwsRequest before any async operation —
      // uWS invalidates HttpRequest after the synchronous handler returns
      const url = uwsRequest.getUrl()
      const query = uwsRequest.getQuery()
      const httpMethod = uwsRequest.getMethod().toUpperCase()
      const headers: Record<string, string> = {}
      uwsRequest.forEach((key: string, value: string) => {
        headers[key] = value
      })
      const params: Record<string, string> = {}
      paramNames.forEach((name, index) => {
        params[name] = uwsRequest.getParameter(index)
      })

      const hasBody = METHODS_WITH_BODY.has(httpMethod)
      const origin = headers['origin'] ?? ''
      const { bodyPromise, isAborted } = setupBodyReader(uwsResponse, hasBody)
      const response = buildResponseHelper(uwsResponse, isAborted, origin)

      bodyPromise
        .then((rawBody) => {
          if (isAborted()) return

          let body: unknown = undefined
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

          const request: ParsedRequest = {
            method: httpMethod,
            url,
            params,
            query: parseQueryString(query),
            headers,
            body,
            rawBody,
          }

          runMiddlewareChain(middlewares, handler, request, response).catch((error: unknown) => {
            if (response.sent || isAborted()) return
            if (error instanceof AppError) {
              response.error(error.code, error.message, error.statusCode, error.details)
            } else {
              const message =
                error instanceof Error ? error.message : 'An unexpected error occurred'
              response.error('internal_error', message, 500)
            }
          })
        })
        .catch(() => {
          // Body read failed (request aborted before body was complete)
        })
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
    this.register('get', pattern, middlewares, handler)
  }

  post(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('post', pattern, middlewares, handler)
  }

  put(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('put', pattern, middlewares, handler)
  }

  patch(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('patch', pattern, middlewares, handler)
  }

  delete(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('del', pattern, middlewares, handler)
  }

  options(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('options', pattern, middlewares, handler)
  }

  head(pattern: string, ...args: Array<Middleware | RouteHandler>): void {
    const { middlewares, handler } = this.resolveArgs(args)
    this.register('head', pattern, middlewares, handler)
  }
}
