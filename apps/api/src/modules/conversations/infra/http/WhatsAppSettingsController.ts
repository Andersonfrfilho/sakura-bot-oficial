/**
 * Configuração de mensagens do WhatsApp: saudação/despedida e o template de reabertura da janela
 * de 24h.
 *
 * As mensagens vivem no `SettingsRepository` do @adatechnology/meta-whatsapp-module (tabela
 * `meta_whatsapp.settings`), por empresa — não em variável de ambiente: mudar o texto de boas-vindas
 * não deveria exigir deploy.
 *
 * Os templates vêm da Meta a cada leitura, e não de cópia local, porque quem aprova ou reprova é a
 * Meta: um cache aqui mostraria como disponível um template que já foi rejeitado.
 *
 * `companyId` **sempre** do JWT — nunca do corpo (OWASP API1).
 */

import { z } from 'zod'
import { WhatsAppTemplateProvider } from '@adatechnology/meta-whatsapp-provider'
import { OptimisticLockError, type MetaWhatsAppModule } from '@adatechnology/meta-whatsapp-module'
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'
import type { RouteHandler } from '@/infra/http/router'
import { ValidationError, UnauthorizedError, NotFoundError, ConflictError } from '@/shared/errors/AppError'
import type { MetaWhatsAppModuleRegistry } from '../whatsapp/metaWhatsAppModule'

// `flows` fica undefined quando `features.flowEngine` está desligado — 400 explícito em vez de um
// 500 que esconderia a causa real na tela de fluxos.
function requireFlows(module: MetaWhatsAppModule) {
  if (!module.flows) {
    throw new ValidationError('Motor de fluxo desligado nesta instalação')
  }
  return module.flows
}

const MAX_MESSAGE_LENGTH = 4096

const saveSettingsSchema = z.object({
  welcomeMessage: z.string().max(MAX_MESSAGE_LENGTH).optional(),
  farewellMessage: z.string().max(MAX_MESSAGE_LENGTH).optional(),
  templateName: z.string().max(255).optional(),
  templateLanguage: z.string().max(20).optional(),
  templateVariables: z.array(z.string().max(255)).optional(),
})

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.enum(['UTILITY', 'MARKETING']),
  language: z.string().min(2).max(20),
  headerType: z.enum(['NONE', 'TEXT']),
  headerText: z.string().max(60).optional(),
  bodyText: z.string().min(1).max(1024),
  footerText: z.string().max(60).optional(),
})

export class WhatsAppSettingsController {
  constructor(
    private readonly modules: MetaWhatsAppModuleRegistry,
    private readonly templates: WhatsAppTemplateProvider
  ) {}

  private companyOf(request: Parameters<RouteHandler>[0]): string {
    if (!request.user) throw new UnauthorizedError()
    return request.user.establishmentId
  }

  get: RouteHandler = async (request, response) => {
    const companyId = this.companyOf(request)
    const settings = await this.modules.forEstablishment(companyId).settings.get(companyId)
    response.json(settings)
  }

  save: RouteHandler = async (request, response) => {
    const companyId = this.companyOf(request)
    const parsed = saveSettingsSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    // `exactOptionalPropertyTypes`: chave presente com `undefined` não é o mesmo que ausente, e o
    // repositório trata ausência como "não mexer neste campo".
    const { welcomeMessage, farewellMessage, templateName, templateLanguage, templateVariables } =
      parsed.data

    const saved = await this.modules.forEstablishment(companyId).settings.save(companyId, {
      ...(welcomeMessage !== undefined ? { welcomeMessage } : {}),
      ...(farewellMessage !== undefined ? { farewellMessage } : {}),
      ...(templateName !== undefined ? { templateName } : {}),
      ...(templateLanguage !== undefined ? { templateLanguage } : {}),
      ...(templateVariables !== undefined ? { templateVariables } : {}),
    })

    response.json(saved)
  }

  listTemplates: RouteHandler = async (_request, response) => {
    const templates = await this.templates.listTemplates()
    response.json({ data: templates })
  }

  createTemplate: RouteHandler = async (request, response) => {
    const parsed = createTemplateSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const { headerText, footerText, ...template } = parsed.data
    const result = await this.templates.createTemplate({
      ...template,
      ...(headerText !== undefined ? { headerText } : {}),
      ...(footerText !== undefined ? { footerText } : {}),
    })
    response.json(result, 201)
  }

  listFlows: RouteHandler = async (request, response) => {
    const companyId = this.companyOf(request)
    const flows = await requireFlows(this.modules.forEstablishment(companyId)).list.execute({
      companyId,
    })
    response.json(flows)
  }

  getFlow: RouteHandler = async (request, response) => {
    const companyId = this.companyOf(request)
    const key = request.params['key']
    if (!key) throw new ValidationError('Chave do fluxo ausente')

    const flow = await requireFlows(this.modules.forEstablishment(companyId)).get.execute({
      companyId,
      key,
    })
    if (!flow) throw new NotFoundError('Fluxo')

    response.json(flow)
  }

  createFlow: RouteHandler = async (request, response) => {
    const companyId = this.companyOf(request)
    const body = request.body as { key?: unknown; label?: unknown; startNodeId?: unknown; nodes?: unknown }
    if (typeof body?.key !== 'string' || typeof body?.label !== 'string') {
      throw new ValidationError('Campos `key` e `label` são obrigatórios')
    }

    const startNodeId = typeof body.startNodeId === 'string' ? body.startNodeId : 'start'
    const flow = await requireFlows(this.modules.forEstablishment(companyId)).create.execute({
      companyId,
      key: body.key,
      label: body.label,
      startNodeId,
      nodes: (body.nodes as FlowGraphData['nodes']) ?? {},
    })
    response.json(flow, 201)
  }

  // Save otimista por versão: dois atendentes editando o mesmo fluxo não sobrescrevem um ao outro
  // em silêncio — o segundo recebe 409 e a UI pede para recarregar.
  saveFlow: RouteHandler = async (request, response) => {
    const companyId = this.companyOf(request)
    const key = request.params['key']
    if (!key) throw new ValidationError('Chave do fluxo ausente')

    const body = request.body as { graph?: FlowGraphData; expectedVersion?: unknown }
    if (typeof body?.expectedVersion !== 'number' || !body.graph) {
      throw new ValidationError('Campos `graph` e `expectedVersion` são obrigatórios')
    }

    try {
      const flow = await requireFlows(this.modules.forEstablishment(companyId)).save.execute({
        companyId,
        // A chave da rota manda sobre a do corpo: renomear um fluxo por PUT criaria um segundo
        // grafo em vez de atualizar o da URL.
        graph: { ...body.graph, key },
        expectedVersion: body.expectedVersion,
      })
      response.json(flow)
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        throw new ConflictError('O fluxo foi alterado por outra pessoa — recarregue antes de gravar')
      }
      throw error
    }
  }

  deleteFlow: RouteHandler = async (request, response) => {
    const companyId = this.companyOf(request)
    const key = request.params['key']
    if (!key) throw new ValidationError('Chave do fluxo ausente')

    await requireFlows(this.modules.forEstablishment(companyId)).delete.execute({ companyId, key })
    response.json(null, 204)
  }

  // Quantas conversas estão paradas em cada nó agora — é o que pinta o contador no editor.
  liveFlowPositions: RouteHandler = async (request, response) => {
    const companyId = this.companyOf(request)
    const positions = await requireFlows(this.modules.forEstablishment(companyId)).livePositions.execute({
      companyId,
    })
    response.json(positions)
  }
}
