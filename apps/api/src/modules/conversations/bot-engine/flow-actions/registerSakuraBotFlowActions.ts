/**
 * Copyright (c) 2026 Ada Technology. All rights reserved.
 *
 * This source code is proprietary and confidential. Unauthorized copying,
 * modification, distribution, or use of this file, via any medium, is
 * strictly prohibited without prior written permission from Ada Technology.
 *
 * Author: Anderson Filho <andersonfrfilho@gmail.com>
 *
 * Registra a `action` de handover entre o grafo do motor de fluxo e a engine modularizada do
 * sakura (Fase 1, Passo 2 do plano de migração n8n → SDK).
 *
 * Decisão: UMA ação genérica (`sakura_bot_handover`), não uma por handler complexo. A hipótese
 * original do plano (`registerFlowAction` por handler — payment/delivery/reservation/ordering/
 * misc) presumia que cada handler seria invocado isoladamente pelo grafo, um por nó. Isso não é
 * verdade aqui: `runBotEngine()` (Passo 1) já roda a cadeia INTEIRA dos 10 handlers e decide
 * sozinho, via `BotState`, qual deles trata a mensagem — o roteamento fino já existe dentro da
 * engine modularizada, replicá-lo como grafo de `action`s duplicaria a máquina de estados em dois
 * lugares. A ação aqui é deliberadamente burra: entrega a mensagem crua para `runBotEngine`, manda
 * as respostas, persiste o que as flags pedirem, e devolve o controle ao MESMO nó do grafo
 * (`next: node.id`) — um self-loop. Diferente do quickcart (`FlowDriver`/`handOver`), que solta a
 * posição do grafo e deixa a PRÓXIMA mensagem cair fora do interpretador via `currentState` da
 * sessão: aqui não existe esse mecanismo por fora do módulo, e `runBotEngine` já é síncrona e
 * autocontida por turno — não precisa de "próxima mensagem" para continuar um handler em curso.
 *
 * Convenção assumida para o texto de entrada (a definir formalmente na Fase 2, ao desenhar o
 * grafo): o nó `action` declara `contextKey: INCOMING_TEXT_CONTEXT_KEY`, e o interpretador grava a
 * resposta do usuário ali antes de invocar a ação — mesmo padrão de um nó `question` comum. Sem
 * fallback silencioso: texto ausente é tratado como string vazia (a engine já lida com "sair"/
 * estado ocioso no meio de qualquer handler).
 */

import type { FlowActionHandler, FlowActionResult } from '@adatechnology/meta-whatsapp-contracts'
import { runBotEngine } from '../runBotEngine'
import type { IncomingMessage } from '../shared/botEngine.types'
import type { BotEngineDataLoaderInterface } from './BotEngineDataLoader'
import type { BotEngineResultPersisterInterface } from './persistBotEngineResult'
import { sendOutgoingMessages } from './sendOutgoingMessages'

export const SAKURA_FLOW_ACTION_KIND = {
  HANDOVER: 'sakura_bot_handover',
} as const

export const INCOMING_TEXT_CONTEXT_KEY = 'sakura_incoming_text'

const WEEKDAY_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const

function buildIncomingMessage(params: {
  whatsappNumber: string
  establishmentId: string
  text: string
  now: Date
}): IncomingMessage {
  return {
    tel: params.whatsappNumber,
    instancia: params.establishmentId,
    texto: params.text,
    horaAtual: params.now.toISOString().slice(11, 16),
    diaSemana: WEEKDAY_NAMES[params.now.getDay()] ?? 'dom',
  }
}

export interface RegisterSakuraBotFlowActionsParams {
  readonly registerFlowAction: (kind: string, handler: FlowActionHandler) => void
  readonly dataLoader: BotEngineDataLoaderInterface
  readonly resultPersister: BotEngineResultPersisterInterface
}

export function registerSakuraBotFlowActions(params: RegisterSakuraBotFlowActionsParams): void {
  const { registerFlowAction, dataLoader, resultPersister } = params

  registerFlowAction(SAKURA_FLOW_ACTION_KIND.HANDOVER, async ({ node, session, channel, context }): Promise<FlowActionResult> => {
    const establishmentId = session.companyId
    const whatsappNumber = session.whatsappNumber
    const text = typeof context[INCOMING_TEXT_CONTEXT_KEY] === 'string' ? (context[INCOMING_TEXT_CONTEXT_KEY] as string) : ''

    const { data, customerId } = await dataLoader.load({ establishmentId, whatsappNumber })
    const message = buildIncomingMessage({ whatsappNumber, establishmentId, text, now: new Date() })

    const result = await runBotEngine({ message, data })

    await sendOutgoingMessages(channel, whatsappNumber, result.respostas)
    await resultPersister.persist({ establishmentId, whatsappNumber, customerId, result })

    return { next: node.id, context: { ...context, sakuraBotState: result.state } }
  })
}
