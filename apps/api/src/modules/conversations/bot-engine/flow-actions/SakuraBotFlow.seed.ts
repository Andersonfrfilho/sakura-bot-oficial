/**
 * Copyright (c) 2026 Ada Technology. All rights reserved.
 *
 * This source code is proprietary and confidential. Unauthorized copying,
 * modification, distribution, or use of this file, via any medium, is
 * strictly prohibited without prior written permission from Ada Technology.
 *
 * Author: Anderson Filho <andersonfrfilho@gmail.com>
 *
 * Grafo do bot do sakura (Fase 2 do plano de migração n8n → SDK).
 *
 * Forma do grafo: um único nó `action`, em self-loop. Não é uma simplificação provisória — é a
 * consequência direta da decisão já tomada na Fase 1, Passo 2 (`registerSakuraBotFlowActions.ts`):
 * `runBotEngine()` já roteia sozinha, via `BotState`, entre os 10 handlers (GlobalHandler,
 * GreetingHandler, CartHandler, DeliveryHandler, PaymentHandler, MenuShortcutsHandler,
 * ReservationHandler, MiscHandler, OrderingHandler, FallbackHandler) — a máquina de estados inteira
 * de `router.ts` já vive dentro da engine modularizada, fora do grafo. Decompor saudação/menu de
 * volta em nós nativos (`question`/`menu`) duplicaria essa máquina de estados em dois lugares: o
 * grafo decidiria "saudação vs. menu" por aresta, e `BotState` decidiria a mesma coisa por dentro —
 * dois roteadores para o mesmo roteamento, podendo divergir. A ação `sakura_bot_handover` já entrega
 * o texto cru para `runBotEngine` e devolve `next: node.id`; um grafo de nó único é o reflexo fiel
 * disso, não uma limitação a corrigir depois. Precedente: o próprio quickcart evita decompor
 * carrinho/checkout em nós declarativos pelo mesmo motivo (comentário em `FlowDriver.ts`).
 *
 * Semente, não fonte da verdade: uma vez criado, o grafo pode ser editado pelo painel. Este arquivo
 * só cobre a instalação nova — `seedSakuraBotFlow` nunca sobrescreve um grafo já gravado.
 */

import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'
import { SAKURA_FLOW_ACTION_KIND } from './registerSakuraBotFlowActions'

export const SAKURA_BOT_FLOW_KEY = 'sakura_bot'
export const SAKURA_BOT_FLOW_START_NODE_ID = 'atendimento'

// `version` é preenchido pelo `CreateFlowGraphUseCase` a partir do que está gravado — o `Omit`
// deixa isso explícito no tipo da semente.
export const SAKURA_BOT_FLOW_SEED: Omit<FlowGraphData, 'version'> = {
  key: SAKURA_BOT_FLOW_KEY,
  label: 'Atendimento do bot (sakura)',
  startNodeId: SAKURA_BOT_FLOW_START_NODE_ID,
  nodes: {
    [SAKURA_BOT_FLOW_START_NODE_ID]: {
      id: SAKURA_BOT_FLOW_START_NODE_ID,
      type: 'action',
      actionKind: SAKURA_FLOW_ACTION_KIND.HANDOVER,
      position: { x: 0, y: 0 },
    },
  },
}
