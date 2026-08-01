/**
 * Fábrica do @adatechnology/meta-whatsapp-module para o Order Hub.
 *
 * Uma instância por estabelecimento, memoizada. O pacote assume um tenant por instância — a
 * configuração da Meta e o notificador de tempo real são injetados, e nenhum evento que ele emite
 * carrega `companyId`. Uma instância única compartilhada entregaria evento de uma conversa para a
 * sala de outro estabelecimento.
 *
 * `flowEngine` fica desligado: neste projeto o bot é o workflow do n8n (`src/*.js` → `make build`),
 * e a API só registra e opera o atendimento humano.
 */

import {
  createMetaWhatsAppModule,
  type MetaWhatsAppDatabase,
  type MetaWhatsAppModule,
  type NonceStoreInterface,
  verifyWebhookChallenge,
} from '@adatechnology/meta-whatsapp-module'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { createConversationRealtimeNotifier } from '../realtime/ConversationRealtimeNotifier'

const NONCE_VALUE = '1'

interface MetaWhatsAppModuleRegistryParams {
  readonly db: MetaWhatsAppDatabase
  readonly cache: CacheProvider
  readonly webSocketHub: WebSocketHub
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

      const instance = createMetaWhatsAppModule({
        db: params.db,
        config,
        nonceStore,
        features: { flowEngine: false },
        providers: {
          realtime: createConversationRealtimeNotifier(params.webSocketHub, establishmentId),
        },
      })

      instances.set(establishmentId, instance)
      return instance
    },

    verifyChallenge(query): string {
      return verifyWebhookChallenge({ ...query, expectedToken: config.webhookVerifyToken })
    },
  }
}
