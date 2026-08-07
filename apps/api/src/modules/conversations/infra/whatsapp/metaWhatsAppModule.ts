/**
 * Fábrica do @adatechnology/meta-whatsapp-module para o Order Hub.
 *
 * Uma instância por estabelecimento, memoizada. O pacote assume um tenant por instância — a
 * configuração da Meta e o notificador de tempo real são injetados, e nenhum evento que ele emite
 * carrega `companyId`. Uma instância única compartilhada entregaria evento de uma conversa para a
 * sala de outro estabelecimento.
 *
 * `flowEngine` ligado: início da migração do bot de n8n para o motor de fluxo do SDK (ver plano de
 * migração). Fase 0 só liga a flag e expõe a tela de fluxos — o grafo real ainda não existe e o n8n
 * continua sendo quem processa o webhook da Meta até a Fase 3.
 */

import {
  createMetaWhatsAppModule,
  type MetaWhatsAppDatabase,
  type MetaWhatsAppModule,
  type NonceStoreInterface,
  verifyWebhookChallenge,
} from '@adatechnology/meta-whatsapp-module'
import type { ObjectStorageInterface } from '@adatechnology/meta-whatsapp-contracts'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import {
  conversationDocumentsQueue,
  inboundMediaJobId,
} from '@/infra/queue/conversationDocumentsQueue'
import { CONVERSATION_DOCUMENTS_JOB } from '@/infra/queue/QueueNames.constant'
import { createConversationRealtimeNotifier } from '../realtime/ConversationRealtimeNotifier'
import type * as schema from '@/infra/database/schema'
import type { BotConfigRepository } from '@/infra/database/BotConfigRepository'
import type { CreateOrderUseCase } from '@/modules/orders/application/use-cases/CreateOrderUseCase'
import type { FindOrCreateCustomerUseCase } from '@/modules/customers/application/use-cases/FindOrCreateCustomerUseCase'
import { DrizzleBotEngineSessionRepository } from '../../bot-engine/flow-actions/BotEngineSessionRepository'
import { DrizzleBotEngineDataLoader } from '../../bot-engine/flow-actions/BotEngineDataLoader'
import { BotEngineResultPersister } from '../../bot-engine/flow-actions/persistBotEngineResult'
import { registerSakuraBotFlowActions } from '../../bot-engine/flow-actions/registerSakuraBotFlowActions'
import { SakuraBotFlowDriver } from '../../bot-engine/flow-actions/SakuraBotFlowDriver'
import { SAKURA_BOT_FLOW_SEED } from '../../bot-engine/flow-actions/SakuraBotFlow.seed'

const NONCE_VALUE = '1'

interface MetaWhatsAppModuleRegistryParams {
  readonly db: MetaWhatsAppDatabase
  readonly cache: CacheProvider
  readonly webSocketHub: WebSocketHub
  /**
   * Ausente, a biblioteca de documentos fica desligada: o módulo não expõe `ingestInboundMedia` e
   * o anexo continua acessível só pelo proxy de mídia da Meta, enquanto a URL dela viver.
   */
  readonly objectStorage?: ObjectStorageInterface | undefined
  /**
   * Faz o canal aceitar mídia gravada no simulador (`preview-upload:<chave>`) — é o que devolve o
   * microfone ao painel. Ligado, um webhook forjado consegue ler objeto do bucket por id: só vale
   * onde o simulador já está habilitado.
   */
  readonly previewMediaEnabled?: boolean | undefined
  /**
   * Dependências da ação de handover do bot (Fase 1, Passo 2 da migração n8n → SDK). O grafo
   * ainda não existe (Fase 2) e o webhook da Meta continua no n8n (Fase 3) — registrar a ação
   * aqui só a deixa pronta para quando o grafo passar a chamá-la.
   */
  readonly botEngineFlowActions: {
    readonly botConfigRepository: BotConfigRepository
    readonly createOrderUseCase: CreateOrderUseCase
    readonly findOrCreateCustomerUseCase: FindOrCreateCustomerUseCase
  }
}

export interface MetaWhatsAppModuleRegistry {
  forEstablishment(establishmentId: string): MetaWhatsAppModule
  /**
   * A verificação do `hub.challenge` acontece antes de existir tenant: a Meta chama a URL crua ao
   * registrar o webhook. Fica no registry para o token de verificação ser lido num lugar só.
   */
  verifyChallenge(query: {
    mode: string | null
    token: string | null
    challenge: string | null
  }): string
}

function toNonceStore(cache: CacheProvider): NonceStoreInterface {
  return {
    async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
      return cache.setIfNotExists(key, NONCE_VALUE, ttlSeconds)
    },
  }
}

/**
 * Cria o grafo do bot do sakura na primeira vez que o estabelecimento é atendido. Nunca sobrescreve
 * um grafo já gravado — depois de criado, o grafo é editável pelo painel (`WhatsAppSettingsController`).
 */
async function seedSakuraBotFlow(flows: NonNullable<MetaWhatsAppModule['flows']>, establishmentId: string): Promise<void> {
  const existing = await flows.get.execute({ companyId: establishmentId, key: SAKURA_BOT_FLOW_SEED.key })
  if (existing) return

  await flows.create.execute({
    companyId: establishmentId,
    key: SAKURA_BOT_FLOW_SEED.key,
    label: SAKURA_BOT_FLOW_SEED.label,
    startNodeId: SAKURA_BOT_FLOW_SEED.startNodeId,
    nodes: SAKURA_BOT_FLOW_SEED.nodes,
  })
}

export function createMetaWhatsAppModuleRegistry(
  params: MetaWhatsAppModuleRegistryParams
): MetaWhatsAppModuleRegistry {
  const nonceStore = toNonceStore(params.cache)
  const instances = new Map<string, MetaWhatsAppModule>()

  const config = {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
    ...(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
      ? { wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID }
      : {}),
    ...(process.env.WHATSAPP_API_VERSION ? { apiVersion: process.env.WHATSAPP_API_VERSION } : {}),
  }

  return {
    forEstablishment(establishmentId: string): MetaWhatsAppModule {
      const cached = instances.get(establishmentId)
      if (cached) return cached

      // Referência preenchida DEPOIS que `instance` existe (abaixo). O hook só é chamado pelo
      // módulo quando uma mensagem chega — muito depois deste `createMetaWhatsAppModule` retornar
      // — então o forward-ref é seguro: por construção, `instanceRef` já está setado no primeiro
      // uso real.
      let instanceRef: MetaWhatsAppModule | undefined

      const instance = createMetaWhatsAppModule({
        db: params.db,
        config,
        nonceStore,
        features: {
          flowEngine: true,
          // Sem storage o flag é ignorado pelo pacote — não há bytes para devolver.
          previewMedia: Boolean(params.previewMediaEnabled && params.objectStorage),
        },
        providers: {
          realtime: createConversationRealtimeNotifier(params.webSocketHub, establishmentId),
          ...(params.objectStorage ? { objectStorage: params.objectStorage } : {}),
        },
        hooks: {
          // Ponte do grafo do bot (Fase 2 da migração n8n → SDK) — ver `SakuraBotFlowDriver.ts`
          // para o porquê de o módulo não rodar o interpretador sozinho.
          onMessageReceived: async (message, session) => {
            const flows = instanceRef?.flows
            if (!flows) return { outcome: 'continue' }

            const driver = new SakuraBotFlowDriver({
              interpreter: flows.interpreter,
              sessionRepository: instanceRef!.conversations.repository,
              loadFlow: (key) => flows.get.execute({ companyId: establishmentId, key }),
              defaultFlowKey: SAKURA_BOT_FLOW_SEED.key,
            })

            const result = await driver.handleInbound({
              companyId: establishmentId,
              whatsappNumber: message.from,
              text: message.text?.body ?? '',
              session,
              channel: instanceRef!.channel,
            })

            return { outcome: result.handled ? 'handled' : 'continue' }
          },
          // Hook próprio, e não parte de `onMessageReceived`: aquele não roda em atendimento
          // humano, que é justamente quando o cliente manda comprovante para o atendente.
          ...(params.objectStorage
            ? {
                onMediaReceived: async (media): Promise<void> => {
                  await conversationDocumentsQueue.add(
                    CONVERSATION_DOCUMENTS_JOB.INGEST_INBOUND_MEDIA,
                    {
                      companyId: media.companyId,
                      messageId: media.messageId,
                      sourceMediaId: media.sourceMediaId,
                      mimeType: media.mimeType,
                      ...(media.filename ? { filename: media.filename } : {}),
                    },
                    { jobId: inboundMediaJobId(media.companyId, media.sourceMediaId) }
                  )
                },
              }
            : {}),
        },
      })
      instanceRef = instance

      if (instance.flows) {
        // `params.db` chega tipado como `MetaWhatsAppDatabase` (o SDK não conhece nosso schema) —
        // é o MESMO objeto `NodePgDatabase<typeof schema>` que o container monta em
        // `@/infra/database/connection`, então o cast é seguro.
        const sakuraDb = params.db as unknown as NodePgDatabase<typeof schema>
        const sessionRepository = new DrizzleBotEngineSessionRepository(sakuraDb)
        const dataLoader = new DrizzleBotEngineDataLoader(
          sakuraDb,
          params.botEngineFlowActions.botConfigRepository,
          sessionRepository,
          params.botEngineFlowActions.findOrCreateCustomerUseCase
        )
        const resultPersister = new BotEngineResultPersister(
          sakuraDb,
          sessionRepository,
          params.botEngineFlowActions.createOrderUseCase
        )

        registerSakuraBotFlowActions({
          registerFlowAction: instance.flows.registerFlowAction,
          dataLoader,
          resultPersister,
        })

        // Disparo assíncrono, não aguardado: `forEstablishment` é síncrono (a instância é
        // memoizada e devolvida na hora) e mudar isso reabriria todos os ~30 call sites que
        // chamam `forEstablishment(...)` direto. Sem risco hoje — o webhook real da Meta continua
        // no n8n até a Fase 3, o único consumidor do grafo é o simulador de conversa, que roda bem
        // depois do boot. Na Fase 3 (corte), confirmar em staging que o grafo já existe (chamando
        // `forEstablishment` uma vez por estabelecimento) antes de reapontar o webhook da Meta.
        void seedSakuraBotFlow(instance.flows, establishmentId).catch((error: unknown) => {
          console.error('[MetaWhatsAppModule] falha ao semear o grafo do bot do sakura', establishmentId, error)
        })
      }

      instances.set(establishmentId, instance)
      return instance
    },

    verifyChallenge(query): string {
      return verifyWebhookChallenge({ ...query, expectedToken: config.webhookVerifyToken })
    },
  }
}
