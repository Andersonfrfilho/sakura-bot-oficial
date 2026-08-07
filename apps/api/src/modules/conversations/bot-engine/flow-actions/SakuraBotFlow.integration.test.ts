/**
 * Copyright (c) 2026 Ada Technology. All rights reserved.
 *
 * This source code is proprietary and confidential. Unauthorized copying,
 * modification, distribution, or use of this file, via any medium, is
 * strictly prohibited without prior written permission from Ada Technology.
 *
 * Author: Anderson Filho <andersonfrfilho@gmail.com>
 *
 * Teste de integração da Fase 2: prova que o grafo semeado (`SakuraBotFlow.seed.ts`), a ação
 * registrada (`registerSakuraBotFlowActions.ts`) e a ponte com o interpretador
 * (`SakuraBotFlowDriver.ts`) funcionam JUNTOS, turno a turno, do mesmo jeito que
 * `SendPreviewInboundUseCase` os aciona no simulador de conversa.
 *
 * Só a fronteira de I/O é falsa (Postgres, WhatsApp) — o `FlowInterpreter` é o real do
 * `@adatechnology/meta-whatsapp-module`, e `runBotEngine` é o real da Fase 1. Não há harness de
 * banco de dados neste repositório (nenhum outro teste sobe Postgres); duplicar essa infra só
 * para a Fase 2 seria escopo maior que o pedido — este teste cobre o que os outros dois produtos
 * cobrem com o simulador: o CAMINHO, não a camada de persistência real.
 */

import { describe, expect, test } from 'bun:test'
import { FlowInterpreter } from '@adatechnology/meta-whatsapp-module'
import type { ChannelAdapterInterface, ConversationSession } from '@adatechnology/meta-whatsapp-contracts'

import { registerSakuraBotFlowActions } from './registerSakuraBotFlowActions'
import { SakuraBotFlowDriver } from './SakuraBotFlowDriver'
import { SAKURA_BOT_FLOW_SEED } from './SakuraBotFlow.seed'
import { BotState } from '../shared/botEngine.constant'
import type { BotEngineDataLoaderInterface } from './BotEngineDataLoader'
import type { BotEngineResultPersisterInterface, PersistBotEngineResultParams } from './persistBotEngineResult'

const ESTABLISHMENT_ID = 'establishment-1'
const CUSTOMER_ID = 'customer-1'
const WHATSAPP_NUMBER = '5511999999999'

function buildChannel(sent: string[]): ChannelAdapterInterface {
  return {
    sendText: async (_to: string, body: string) => {
      sent.push(body)
      return { externalMessageId: null }
    },
    sendMedia: async () => ({ externalMessageId: null }),
    sendTemplate: async () => ({ externalMessageId: null }),
    sendInteractiveList: async (params: { body: string }) => {
      sent.push(params.body)
      return { externalMessageId: null }
    },
    fetchMediaAsBase64: async () => ({ data: '', mimeType: '' }),
  } as unknown as ChannelAdapterInterface
}

/**
 * Sessão em memória, no lugar do Postgres: guarda exatamente o que
 * `NonNullable<MetaWhatsAppModule['flows']>` e `MetaWhatsAppModule['conversations']['repository']`
 * gravariam — posição no grafo e `context` acumulado — para o próximo turno reler.
 */
function buildFakeSessionRepository(session: ConversationSession) {
  return {
    async setFlowPosition(_companyId: string, _whatsappNumber: string, flowKey: string | null, currentNodeId: string | null): Promise<void> {
      session.flowKey = flowKey
      session.currentNodeId = currentNodeId
    },
    async patchContext(_companyId: string, _whatsappNumber: string, patch: Record<string, unknown>): Promise<void> {
      session.context = { ...session.context, ...patch }
    },
  } as unknown as import('@adatechnology/meta-whatsapp-module').SessionRepository
}

/**
 * Estado de bot em memória, no lugar das tabelas do sakura — reflete o que
 * `BotEngineDataLoader`/`BotEngineResultPersister` reais leem e gravam no Postgres a cada turno.
 */
function buildFakeBotEngineStore() {
  const store: { state: string; customerName: string | null; cart: unknown } = {
    state: BotState.START,
    customerName: null,
    cart: undefined,
  }

  const dataLoader: BotEngineDataLoaderInterface = {
    async load() {
      return {
        customerId: CUSTOMER_ID,
        data: {
          establishment: { name: 'Sakura', ignore_hours: true, city: 'São Paulo' },
          products: [{ id: 'p1', name: 'Temaki Salmão', price: 30, category: 'Temakis' }],
          payment_types: [{ name: 'pix', label: 'Pix' }],
          order_types: [{ name: 'retirada', label: 'Retirada' }],
          marketing_opt_in: true,
          customer_name: store.customerName,
          session: { state: store.state, cart: store.cart },
        },
      } as never
    },
  }

  const resultPersister: BotEngineResultPersisterInterface = {
    async persist(params: PersistBotEngineResultParams) {
      store.state = params.result.state
      store.cart = params.result.cart
      if (params.result.save_customer_name && params.result.customer_name_to_save) {
        store.customerName = params.result.customer_name_to_save
      }
    },
  }

  return { store, dataLoader, resultPersister }
}

function buildSession(): ConversationSession {
  return {
    id: 'session-1',
    companyId: ESTABLISHMENT_ID,
    whatsappNumber: WHATSAPP_NUMBER,
    currentState: BotState.START,
    // Sessão nova: sem posição no grafo ainda — o driver deve cair no `defaultFlowKey`.
    flowKey: null,
    currentNodeId: null,
    context: {},
    mode: 'bot',
    assignedUserId: null,
    humanRequestedAt: null,
    lastInboundAt: null,
    lastAgentReadAt: null,
    lastActivity: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

async function loadFlow(key: string) {
  if (key !== SAKURA_BOT_FLOW_SEED.key) return undefined
  return { ...SAKURA_BOT_FLOW_SEED, version: 1 }
}

describe('grafo do sakura (interpretador real + ação real + driver real)', () => {
  test('saudação sem nome cadastrado → pede o nome, permanece no mesmo nó (self-loop)', async () => {
    const interpreter = new FlowInterpreter()
    const { store, dataLoader, resultPersister } = buildFakeBotEngineStore()
    registerSakuraBotFlowActions({ registerFlowAction: interpreter.registerFlowAction.bind(interpreter), dataLoader, resultPersister })

    const session = buildSession()
    const sessionRepository = buildFakeSessionRepository(session)
    const driver = new SakuraBotFlowDriver({
      interpreter,
      sessionRepository,
      loadFlow,
      defaultFlowKey: SAKURA_BOT_FLOW_SEED.key,
    })

    const sent: string[] = []
    const result = await driver.handleInbound({
      companyId: ESTABLISHMENT_ID,
      whatsappNumber: WHATSAPP_NUMBER,
      text: 'oi',
      session,
      channel: buildChannel(sent),
    })

    expect(result.handled).toBe(true)
    // Self-loop: o grafo trivial de um nó devolve `next: node.id` — a posição não muda de nó.
    expect(session.flowKey).toBe(SAKURA_BOT_FLOW_SEED.key)
    expect(session.currentNodeId).toBe(SAKURA_BOT_FLOW_SEED.startNodeId)
    expect(store.state).toBe(BotState.AWAITING_NAME)
    expect(sent.some((text) => text.toLowerCase().includes('nome'))).toBe(true)
  })

  test('caminho completo: saudação → informa o nome → pede o cardápio, três turnos pelo mesmo grafo', async () => {
    const interpreter = new FlowInterpreter()
    const { store, dataLoader, resultPersister } = buildFakeBotEngineStore()
    registerSakuraBotFlowActions({ registerFlowAction: interpreter.registerFlowAction.bind(interpreter), dataLoader, resultPersister })

    const session = buildSession()
    const sessionRepository = buildFakeSessionRepository(session)
    const driver = new SakuraBotFlowDriver({
      interpreter,
      sessionRepository,
      loadFlow,
      defaultFlowKey: SAKURA_BOT_FLOW_SEED.key,
    })

    async function turn(text: string): Promise<string[]> {
      const sent: string[] = []
      const outcome = await driver.handleInbound({
        companyId: ESTABLISHMENT_ID,
        whatsappNumber: WHATSAPP_NUMBER,
        text,
        session,
        channel: buildChannel(sent),
      })
      expect(outcome.handled).toBe(true)
      return sent
    }

    const greeting = await turn('oi')
    expect(store.state).toBe(BotState.AWAITING_NAME)
    expect(greeting.some((text) => text.toLowerCase().includes('nome'))).toBe(true)

    const afterName = await turn('Anderson')
    expect(store.state).toBe(BotState.START)
    expect(afterName.join(' ').toLowerCase()).toContain('anderson')

    const afterMenu = await turn('cardapio')
    expect(store.state).toBe(BotState.ORDERING_CAT)
    expect(afterMenu.length).toBeGreaterThan(0)

    // Nenhum dos três turnos saiu do único nó do grafo — é o roteamento inteiro (BotState) vivendo
    // dentro de `runBotEngine`, fora do grafo, exatamente como a Fase 1/2 decidiram.
    expect(session.currentNodeId).toBe(SAKURA_BOT_FLOW_SEED.startNodeId)
  })

  test('estabelecimento fechado: a ação ainda roda, engine responde com o aviso de fechado', async () => {
    const interpreter = new FlowInterpreter()
    const dataLoader: BotEngineDataLoaderInterface = {
      async load() {
        return {
          customerId: CUSTOMER_ID,
          data: {
            establishment: { name: 'Sakura', ignore_hours: false, city: 'São Paulo', open_hour: '23:59', close_hour: '23:58' },
            products: [],
            payment_types: [],
            order_types: [],
            marketing_opt_in: false,
            customer_name: 'Anderson',
            session: { state: BotState.START },
          },
        } as never
      },
    }
    const resultPersister: BotEngineResultPersisterInterface = { async persist() {} }
    registerSakuraBotFlowActions({ registerFlowAction: interpreter.registerFlowAction.bind(interpreter), dataLoader, resultPersister })

    const session = buildSession()
    const sessionRepository = buildFakeSessionRepository(session)
    const driver = new SakuraBotFlowDriver({
      interpreter,
      sessionRepository,
      loadFlow,
      defaultFlowKey: SAKURA_BOT_FLOW_SEED.key,
    })

    const sent: string[] = []
    const result = await driver.handleInbound({
      companyId: ESTABLISHMENT_ID,
      whatsappNumber: WHATSAPP_NUMBER,
      text: 'cardapio',
      session,
      channel: buildChannel(sent),
    })

    expect(result.handled).toBe(true)
    expect(sent.length).toBe(1)
    // Continua no mesmo nó — fechado não é um estado do grafo, é uma resposta da engine.
    expect(session.currentNodeId).toBe(SAKURA_BOT_FLOW_SEED.startNodeId)
  })
})
