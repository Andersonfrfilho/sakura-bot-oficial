/**
 * Copyright (c) 2026 Ada Technology. All rights reserved.
 *
 * This source code is proprietary and confidential. Unauthorized copying,
 * modification, distribution, or use of this file, via any medium, is
 * strictly prohibited without prior written permission from Ada Technology.
 *
 * Author: Anderson Filho <andersonfrfilho@gmail.com>
 */

import { describe, expect, mock, test } from 'bun:test';
import type {
  ChannelAdapterInterface,
  ConversationSession,
  FlowActionHandler,
  FlowNodeData,
} from '@adatechnology/meta-whatsapp-contracts';

import {
  INCOMING_TEXT_CONTEXT_KEY,
  SAKURA_FLOW_ACTION_KIND,
  registerSakuraBotFlowActions,
} from './registerSakuraBotFlowActions.ts';
import type { BotEngineDataLoaderInterface, LoadBotEngineDataParams } from './BotEngineDataLoader.ts';
import type {
  BotEngineResultPersisterInterface,
  PersistBotEngineResultParams,
} from './persistBotEngineResult.ts';
import { BotState } from '../shared/botEngine.constant.ts';

const ESTABLISHMENT_ID = 'establishment-1';
const CUSTOMER_ID = 'customer-1';
const WHATSAPP_NUMBER = '5511999999999';

function buildSession(): ConversationSession {
  return {
    id: 'session-1',
    companyId: ESTABLISHMENT_ID,
    whatsappNumber: WHATSAPP_NUMBER,
    currentState: 'node-1',
    flowKey: 'main',
    currentNodeId: 'node-1',
    context: {},
    mode: 'bot',
    assignedUserId: null,
    humanRequestedAt: null,
    lastInboundAt: null,
    lastAgentReadAt: null,
    lastActivity: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildNode(): FlowNodeData {
  return { id: 'node-1', type: 'action' };
}

function buildChannel(): ChannelAdapterInterface {
  return {
    sendText: mock(async () => ({ externalMessageId: null })),
    sendMedia: mock(async () => ({ externalMessageId: null })),
    sendTemplate: mock(async () => ({ externalMessageId: null })),
    sendInteractiveList: mock(async () => ({ externalMessageId: null })),
    fetchMediaAsBase64: mock(async () => ({ data: '', mimeType: '' })),
  };
}

describe('registerSakuraBotFlowActions', () => {
  test('registra a ação sakura_bot_handover', () => {
    const registeredHandlers = new Map<string, FlowActionHandler>();
    const dataLoader: BotEngineDataLoaderInterface = { load: mock() as never };
    const resultPersister: BotEngineResultPersisterInterface = { persist: mock() as never };

    registerSakuraBotFlowActions({
      registerFlowAction: (kind, handler) => registeredHandlers.set(kind, handler),
      dataLoader,
      resultPersister,
    });

    expect(registeredHandlers.has(SAKURA_FLOW_ACTION_KIND.HANDOVER)).toBe(true);
  });

  test('processa uma mensagem simples: carrega dados, roda a engine, envia resposta e persiste', async () => {
    const registeredHandlers = new Map<string, FlowActionHandler>();
    const load = mock(async (_params: LoadBotEngineDataParams) => ({
      customerId: CUSTOMER_ID,
      data: {
        establishment: { name: 'Sakura', ignore_hours: true, city: 'São Paulo' },
        products: [{ id: 'p1', name: 'Temaki Salmão', price: 30, category: 'Temakis' }],
        payment_types: [{ name: 'pix', label: 'Pix' }],
        order_types: [{ name: 'retirada', label: 'Retirada' }],
        marketing_opt_in: true,
        customer_name: 'Anderson',
        session: { state: BotState.START },
      },
    }));
    const persist = mock(async (_params: PersistBotEngineResultParams) => undefined);
    const dataLoader: BotEngineDataLoaderInterface = { load: load as never };
    const resultPersister: BotEngineResultPersisterInterface = { persist };
    const channel = buildChannel();

    registerSakuraBotFlowActions({
      registerFlowAction: (kind, handler) => registeredHandlers.set(kind, handler),
      dataLoader,
      resultPersister,
    });

    const handler = registeredHandlers.get(SAKURA_FLOW_ACTION_KIND.HANDOVER);
    expect(handler).toBeDefined();

    const node = buildNode();
    const outcome = await handler!({
      node,
      session: buildSession(),
      channel,
      context: { [INCOMING_TEXT_CONTEXT_KEY]: 'oi' },
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]?.[0]).toEqual({
      establishmentId: ESTABLISHMENT_ID,
      whatsappNumber: WHATSAPP_NUMBER,
    });

    expect(persist).toHaveBeenCalledTimes(1);
    const persistCall = persist.mock.calls[0]?.[0];
    expect(persistCall?.establishmentId).toBe(ESTABLISHMENT_ID);
    expect(persistCall?.customerId).toBe(CUSTOMER_ID);

    // Self-loop: a ação devolve o controle ao MESMO nó do grafo, não avança o fluxo sozinha.
    expect(outcome?.next).toBe(node.id);
    expect(channel.sendText).toHaveBeenCalled();
  });
});
