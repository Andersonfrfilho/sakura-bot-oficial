import { jwtVerify, type JWTPayload } from 'jose'
import type { TemplatedApp, WebSocket } from 'uWebSockets.js'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import { WS_EVENTS, type WsServerMessage } from './WebSocketEvents'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'change-me')
const AUTH_TIMEOUT_MS = 5000

interface AuthPayload extends JWTPayload {
  sub: string
  establishmentId: string
  role: string
}

interface WsClientData {
  userId?: string
  establishmentId?: string
  authenticated: boolean
  authTimer?: ReturnType<typeof setTimeout>
}

function isAuthPayload(p: JWTPayload): p is AuthPayload {
  return (
    typeof p.sub === 'string' &&
    typeof (p as Record<string, unknown>)['establishmentId'] === 'string'
  )
}

function buildMessage(type: string, payload?: unknown): string {
  const msg: WsServerMessage = { type, payload, timestamp: new Date().toISOString() }
  return JSON.stringify(msg)
}

export class WebSocketHub {
  private readonly app: TemplatedApp
  private readonly cache: CacheProvider
  // Map of establishmentId → Set of authenticated WebSocket clients
  private readonly rooms = new Map<string, Set<WebSocket<WsClientData>>>()

  constructor(app: TemplatedApp, cache: CacheProvider) {
    this.app = app
    this.cache = cache
    this.setupRoute()
    this.setupRedisSubscription()
  }

  private setupRoute(): void {
    this.app.ws<WsClientData>('/ws', {
      compression: 0,
      maxPayloadLength: 16 * 1024, // 16 KB — no large payloads needed

      open: (ws) => {
        const data = ws.getUserData()
        data.authenticated = false

        // Disconnect if no auth message received within timeout
        data.authTimer = setTimeout(() => {
          if (!data.authenticated) {
            ws.send(buildMessage(WS_EVENTS.AUTH_FAILURE, { reason: 'auth_timeout' }))
            ws.close()
          }
        }, AUTH_TIMEOUT_MS)
      },

      message: async (ws, rawMessage, _isBinary) => {
        const data = ws.getUserData()
        let parsed: Record<string, unknown>

        try {
          parsed = JSON.parse(Buffer.from(rawMessage).toString('utf-8')) as Record<string, unknown>
        } catch {
          ws.send(buildMessage('error', { reason: 'invalid_json' }))
          return
        }

        if (parsed['type'] === WS_EVENTS.AUTH) {
          await this.handleAuth(ws, data, String(parsed['token'] ?? ''))
          return
        }

        if (!data.authenticated) {
          ws.send(buildMessage(WS_EVENTS.AUTH_FAILURE, { reason: 'not_authenticated' }))
          return
        }

        if (parsed['type'] === WS_EVENTS.PING) {
          ws.send(buildMessage(WS_EVENTS.PONG))
          return
        }
      },

      close: (ws) => {
        const data = ws.getUserData()
        if (data.authTimer) clearTimeout(data.authTimer)
        if (data.establishmentId) {
          const room = this.rooms.get(data.establishmentId)
          room?.delete(ws)
          if (room?.size === 0) this.rooms.delete(data.establishmentId)
        }
      },
    })
  }

  private async handleAuth(
    ws: WebSocket<WsClientData>,
    data: WsClientData,
    token: string
  ): Promise<void> {
    if (!token) {
      ws.send(buildMessage(WS_EVENTS.AUTH_FAILURE, { reason: 'missing_token' }))
      ws.close()
      return
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ['HS256'] })
      if (!isAuthPayload(payload)) throw new Error('invalid_payload')

      if (data.authTimer) clearTimeout(data.authTimer)

      data.userId = payload.sub
      data.establishmentId = payload.establishmentId
      data.authenticated = true

      // Join room for this establishment
      if (!this.rooms.has(payload.establishmentId)) {
        this.rooms.set(payload.establishmentId, new Set())
      }
      this.rooms.get(payload.establishmentId)!.add(ws)

      ws.send(buildMessage(WS_EVENTS.AUTH_SUCCESS, { userId: payload.sub }))
    } catch {
      ws.send(buildMessage(WS_EVENTS.AUTH_FAILURE, { reason: 'invalid_token' }))
      ws.close()
    }
  }

  // Broadcast to all authenticated clients in an establishment's room
  broadcast(establishmentId: string, type: string, payload?: unknown): void {
    const room = this.rooms.get(establishmentId)
    if (!room || room.size === 0) return

    const message = buildMessage(type, payload)
    for (const client of room) {
      try {
        client.send(message)
      } catch {
        // Client already disconnected
      }
    }
  }

  // Called from Redis subscription to fan out events across API instances
  private setupRedisSubscription(): void {
    void this.cache.subscribe('ws:broadcast', (rawMessage) => {
      try {
        const { establishmentId, type, payload } = JSON.parse(rawMessage) as {
          establishmentId: string
          type: string
          payload?: unknown
        }
        this.broadcast(establishmentId, type, payload)
      } catch {
        // Malformed pub/sub message
      }
    })
  }

  // Use this to broadcast from any service — Redis ensures multi-instance delivery
  async publishBroadcast(establishmentId: string, type: string, payload?: unknown): Promise<void> {
    await this.cache.publish('ws:broadcast', JSON.stringify({ establishmentId, type, payload }))
  }
}
