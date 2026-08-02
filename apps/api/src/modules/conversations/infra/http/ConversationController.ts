/**
 * Borda HTTP das conversas sobre o @adatechnology/meta-whatsapp-module.
 *
 * O controller não tem regra de negócio: valida entrada, resolve o tenant a partir do JWT e
 * delega. `companyId` **sempre** vem de `request.user.establishmentId` — nunca do corpo — porque
 * o número de WhatsApp é endereçável e aceitar o tenant do cliente seria BOLA (OWASP API1).
 *
 * As rotas e o vocabulário do Order Hub são preservados; o que mudou por baixo é quem executa.
 */

import { z } from 'zod'
import type { MessageRow } from '@adatechnology/meta-whatsapp-module'
import type { RouteHandler } from '@/infra/http/router'
import { ValidationError, UnauthorizedError, NotFoundError } from '@/shared/errors/AppError'
import type { MetaWhatsAppModuleRegistry } from '../whatsapp/metaWhatsAppModule'
import {
  CONVERSATION_AGENT_SENDER as AGENT_SENDER,
  CONVERSATION_START_STATE as START_STATE,
} from '../../shared/conversations.constant'


const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const DEFAULT_HISTORY_LIMIT = 50
const MAX_HISTORY_LIMIT = 200

const sendMessageSchema = z.object({
  body: z.string().min(1).max(4096),
})

const sendMediaSchema = z.object({
  base64Data: z.string().min(1),
  mimeType: z.string().min(1),
  filename: z.string().min(1).max(255),
  caption: z.string().max(1024).optional(),
})

const sendTemplateSchema = z.object({
  templateName: z.string().min(1).max(255),
  languageCode: z.string().max(20).optional(),
  bodyParameters: z.array(z.string()).optional(),
})

const logMessageSchema = z.object({
  establishmentId: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound']),
  sender: z.enum(['customer', 'bot', 'agent']),
  agentUserId: z.string().uuid().optional(),
  type: z.string().min(1).max(32),
  content: z.string().max(4096).optional(),
  payload: z.record(z.unknown()).optional(),
  waMessageId: z.string().max(128).optional(),
  status: z.enum(['sent', 'delivered', 'read', 'failed', 'received']).optional(),
})

const requestHumanSchema = z.object({
  establishmentId: z.string().uuid(),
})

function boundedInteger(raw: string | undefined, fallback: number, max: number): number {
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

export class ConversationController {
  constructor(private readonly modules: MetaWhatsAppModuleRegistry) {}

  private tenantOf(request: Parameters<RouteHandler>[0]): { companyId: string; userId: string } {
    if (!request.user) throw new UnauthorizedError()
    return { companyId: request.user.establishmentId, userId: request.user.id }
  }

  private numberOf(request: Parameters<RouteHandler>[0]): string {
    const whatsappNumber = request.params['whatsapp']
    if (!whatsappNumber) throw new ValidationError('whatsappNumber is required')
    return whatsappNumber
  }

  list: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const { page, pageSize, waitingHuman, search } = request.query

    const currentPage = boundedInteger(page, 1, Number.MAX_SAFE_INTEGER)
    const limit = boundedInteger(pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

    // O módulo não expõe contagem total; pedir um item a mais é o que permite saber se existe
    // próxima página. O total devolvido é, por isso, um piso — exato só na última página.
    const rows = await this.modules.forEstablishment(companyId).conversations.list.execute({
      companyId,
      filters: {
        page: currentPage,
        limit: limit + 1,
        ...(waitingHuman === 'true' ? { waitingHuman: true } : {}),
        ...(search ? { search } : {}),
      },
    })

    const hasNextPage = rows.length > limit
    const data = hasNextPage ? rows.slice(0, limit) : rows
    const consumed = (currentPage - 1) * limit + data.length

    response.json({ data, total: hasNextPage ? consumed + 1 : consumed, hasNextPage })
  }

  history: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const { before, limit } = request.query

    const pageLimit = boundedInteger(limit, DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT)
    const rows = await this.modules.forEstablishment(companyId).conversations.listMessages.execute({
      companyId,
      whatsappNumber: this.numberOf(request),
      limit: pageLimit + 1,
      ...(before ? { before } : {}),
    })

    const hasMore = rows.length > pageLimit
    response.json({ data: hasMore ? rows.slice(0, pageLimit) : rows, hasMore })
  }

  context: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const session = await this.modules
      .forEstablishment(companyId)
      .conversations.repository.getContext(companyId, this.numberOf(request))

    if (!session) throw new NotFoundError('Conversation not found')
    response.json({ currentState: session.currentState, context: session.context })
  }

  send: RouteHandler = async (request, response) => {
    const { companyId, userId } = this.tenantOf(request)
    const parsed = sendMessageSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const message = await this.modules.forEstablishment(companyId).conversations.send.sendText({
      companyId,
      whatsappNumber: this.numberOf(request),
      body: parsed.data.body,
      sender: AGENT_SENDER,
      agentUserId: userId,
      startState: START_STATE,
    })

    response.json(message, 201)
  }

  sendMedia: RouteHandler = async (request, response) => {
    const { companyId, userId } = this.tenantOf(request)
    const parsed = sendMediaSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const message = await this.modules.forEstablishment(companyId).conversations.send.sendMedia({
      companyId,
      whatsappNumber: this.numberOf(request),
      buffer: Buffer.from(parsed.data.base64Data, 'base64'),
      mimeType: parsed.data.mimeType,
      filename: parsed.data.filename,
      ...(parsed.data.caption ? { caption: parsed.data.caption } : {}),
      sender: AGENT_SENDER,
      agentUserId: userId,
      startState: START_STATE,
    })

    response.json(message, 201)
  }

  sendTemplate: RouteHandler = async (request, response) => {
    const { companyId, userId } = this.tenantOf(request)
    const parsed = sendTemplateSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const message = await this.modules.forEstablishment(companyId).conversations.send.sendTemplate({
      companyId,
      whatsappNumber: this.numberOf(request),
      templateName: parsed.data.templateName,
      ...(parsed.data.languageCode ? { languageCode: parsed.data.languageCode } : {}),
      ...(parsed.data.bodyParameters ? { bodyParameters: parsed.data.bodyParameters } : {}),
      sender: AGENT_SENDER,
      agentUserId: userId,
      startState: START_STATE,
    })

    response.json(message, 201)
  }

  takeover: RouteHandler = async (request, response) => {
    const { companyId, userId } = this.tenantOf(request)
    await this.modules.forEstablishment(companyId).conversations.takeover.execute({
      companyId,
      whatsappNumber: this.numberOf(request),
      agentUserId: userId,
    })
    response.json({ success: true })
  }

  release: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    await this.modules.forEstablishment(companyId).conversations.release.execute({
      companyId,
      whatsappNumber: this.numberOf(request),
    })
    response.json({ success: true })
  }

  markRead: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    await this.modules
      .forEstablishment(companyId)
      .conversations.repository.markRead(companyId, this.numberOf(request))
    response.json({ success: true })
  }

  markAllRead: RouteHandler = async (request, response) => {
    const { companyId, userId } = this.tenantOf(request)
    const updated = await this.modules
      .forEstablishment(companyId)
      .conversations.repository.markAllRead(companyId, userId)
    response.json({ success: true, updated })
  }

  export: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const result = await this.modules.forEstablishment(companyId).conversations.export.execute({
      companyId,
      whatsappNumber: this.numberOf(request),
    })
    response.json(result.messages satisfies MessageRow[])
  }

  fetchMedia: RouteHandler = async (request, response) => {
    const { companyId } = this.tenantOf(request)
    const mediaId = request.params['mediaId']
    if (!mediaId) throw new ValidationError('mediaId is required')

    const media = await this.modules.forEstablishment(companyId).channel.fetchMediaAsBase64(mediaId)
    response.json({ base64: media.data, mimeType: media.mimeType })
  }

  // Internal (n8n) — protegido por internalAuth; aqui o tenant vem do corpo porque não há JWT de
  // usuário, e o token interno é escopado ao próprio deploy.
  logMessage: RouteHandler = async (request, response) => {
    const parsed = logMessageSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const { establishmentId, agentUserId, content, payload, waMessageId, status } = parsed.data
    const logged = await this.modules.forEstablishment(establishmentId).conversations.log.execute({
      companyId: establishmentId,
      whatsappNumber: this.numberOf(request),
      direction: parsed.data.direction,
      sender: parsed.data.sender,
      type: parsed.data.type,
      agentUserId: agentUserId ?? null,
      content: content ?? null,
      payload: payload ?? null,
      waMessageId: waMessageId ?? null,
      status: status ?? null,
      startState: START_STATE,
    })

    response.json(logged, 201)
  }

  requestHuman: RouteHandler = async (request, response) => {
    const parsed = requestHumanSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const { establishmentId } = parsed.data
    await this.modules
      .forEstablishment(establishmentId)
      .conversations.repository.requestHuman(establishmentId, this.numberOf(request))

    response.json({ success: true })
  }
}
