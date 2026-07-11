import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import type { ListConversationsUseCase } from '../../application/use-cases/ListConversationsUseCase'
import type { GetConversationHistoryUseCase } from '../../application/use-cases/GetConversationHistoryUseCase'
import type { GetConversationContextUseCase } from '../../application/use-cases/GetConversationContextUseCase'
import type { LogMessageUseCase } from '../../application/use-cases/LogMessageUseCase'
import type { TakeoverConversationUseCase } from '../../application/use-cases/TakeoverConversationUseCase'
import type { ReleaseConversationUseCase } from '../../application/use-cases/ReleaseConversationUseCase'
import type { RequestHumanUseCase } from '../../application/use-cases/RequestHumanUseCase'
import type { MarkConversationReadUseCase } from '../../application/use-cases/MarkConversationReadUseCase'
import type { MarkAllConversationsReadUseCase } from '../../application/use-cases/MarkAllConversationsReadUseCase'
import type { SendAgentMessageUseCase } from '../../application/use-cases/SendAgentMessageUseCase'
import type { SendAgentMediaUseCase } from '../../application/use-cases/SendAgentMediaUseCase'
import type { SendAgentTemplateUseCase } from '../../application/use-cases/SendAgentTemplateUseCase'
import type { ExportConversationUseCase } from '../../application/use-cases/ExportConversationUseCase'
import type { FetchConversationMediaUseCase } from '../../application/use-cases/FetchConversationMediaUseCase'
import { ValidationError, UnauthorizedError } from '@/shared/errors/AppError'

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
  type: z.string().min(1).max(50),
  content: z.string().max(4096).optional(),
  payload: z.record(z.unknown()).optional(),
  waMessageId: z.string().max(255).optional(),
  status: z.string().max(50).optional(),
  currentState: z.string().max(100).optional(),
  context: z.record(z.unknown()).optional(),
})

const requestHumanSchema = z.object({
  establishmentId: z.string().uuid(),
})

export class ConversationController {
  constructor(
    private readonly listConversationsUseCase: ListConversationsUseCase,
    private readonly getConversationHistoryUseCase: GetConversationHistoryUseCase,
    private readonly getConversationContextUseCase: GetConversationContextUseCase,
    private readonly logMessageUseCase: LogMessageUseCase,
    private readonly takeoverConversationUseCase: TakeoverConversationUseCase,
    private readonly releaseConversationUseCase: ReleaseConversationUseCase,
    private readonly requestHumanUseCase: RequestHumanUseCase,
    private readonly markConversationReadUseCase: MarkConversationReadUseCase,
    private readonly markAllConversationsReadUseCase: MarkAllConversationsReadUseCase,
    private readonly sendAgentMessageUseCase: SendAgentMessageUseCase,
    private readonly sendAgentMediaUseCase: SendAgentMediaUseCase,
    private readonly sendAgentTemplateUseCase: SendAgentTemplateUseCase,
    private readonly exportConversationUseCase: ExportConversationUseCase,
    private readonly fetchConversationMediaUseCase: FetchConversationMediaUseCase
  ) {}

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { page, pageSize, waitingHuman, hasUnread, search } = request.query
    const result = await this.listConversationsUseCase.execute({
      establishmentId: request.user.establishmentId,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
      waitingHuman: waitingHuman === 'true' ? true : undefined,
      hasUnread: hasUnread === 'true' ? true : undefined,
      search: search || undefined,
    })
    response.json(result)
  }

  history: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { before, limit } = request.query
    const result = await this.getConversationHistoryUseCase.execute({
      establishmentId: request.user.establishmentId,
      whatsappNumber: request.params['whatsapp']!,
      before: before || undefined,
      limit: limit ? parseInt(limit) : undefined,
    })
    response.json(result)
  }

  context: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const result = await this.getConversationContextUseCase.execute({
      establishmentId: request.user.establishmentId,
      whatsappNumber: request.params['whatsapp']!,
    })
    response.json(result)
  }

  send: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = sendMessageSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const message = await this.sendAgentMessageUseCase.execute({
      establishmentId: request.user.establishmentId,
      whatsappNumber: request.params['whatsapp']!,
      agentUserId: request.user.id,
      body: parsed.data.body,
    })
    response.json(message, 201)
  }

  sendMedia: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = sendMediaSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const message = await this.sendAgentMediaUseCase.execute({
      establishmentId: request.user.establishmentId,
      whatsappNumber: request.params['whatsapp']!,
      agentUserId: request.user.id,
      ...parsed.data,
    })
    response.json(message, 201)
  }

  sendTemplate: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = sendTemplateSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const message = await this.sendAgentTemplateUseCase.execute({
      establishmentId: request.user.establishmentId,
      whatsappNumber: request.params['whatsapp']!,
      agentUserId: request.user.id,
      ...parsed.data,
    })
    response.json(message, 201)
  }

  takeover: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const session = await this.takeoverConversationUseCase.execute({
      establishmentId: request.user.establishmentId,
      whatsappNumber: request.params['whatsapp']!,
      userId: request.user.id,
    })
    response.json(session)
  }

  release: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const session = await this.releaseConversationUseCase.execute({
      establishmentId: request.user.establishmentId,
      whatsappNumber: request.params['whatsapp']!,
    })
    response.json(session)
  }

  markRead: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    await this.markConversationReadUseCase.execute({
      establishmentId: request.user.establishmentId,
      whatsappNumber: request.params['whatsapp']!,
    })
    response.json({ success: true })
  }

  markAllRead: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    await this.markAllConversationsReadUseCase.execute({
      establishmentId: request.user.establishmentId,
    })
    response.json({ success: true })
  }

  export: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const messages = await this.exportConversationUseCase.execute({
      establishmentId: request.user.establishmentId,
      whatsappNumber: request.params['whatsapp']!,
    })
    response.json(messages)
  }

  fetchMedia: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const result = await this.fetchConversationMediaUseCase.execute({
      mediaId: request.params['mediaId']!,
    })
    response.json(result)
  }

  // Internal (n8n) — protected by internalAuth middleware, not authenticate/authorize
  logMessage: RouteHandler = async (request, response) => {
    const parsed = logMessageSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const message = await this.logMessageUseCase.execute({
      ...parsed.data,
      whatsappNumber: request.params['whatsapp']!,
    })
    response.json(message, 201)
  }

  requestHuman: RouteHandler = async (request, response) => {
    const parsed = requestHumanSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const session = await this.requestHumanUseCase.execute({
      establishmentId: parsed.data.establishmentId,
      whatsappNumber: request.params['whatsapp']!,
    })
    response.json(session)
  }
}
