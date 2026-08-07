/**
 * Copyright (c) 2026 Ada Technology. All rights reserved.
 *
 * This source code is proprietary and confidential. Unauthorized copying,
 * modification, distribution, or use of this file, via any medium, is
 * strictly prohibited without prior written permission from Ada Technology.
 *
 * Author: Anderson Filho <andersonfrfilho@gmail.com>
 *
 * Ponte entre `hooks.onMessageReceived` do módulo e o interpretador do grafo (Fase 2 do plano de
 * migração n8n → SDK).
 *
 * Achado nesta fase, não previsto no plano original: `ReceiveWebhookUseCase` (dentro do
 * `@adatechnology/meta-whatsapp-module`) NUNCA chama `FlowInterpreter` sozinho — ele só grava a
 * mensagem e chama `hooks.onMessageReceived`, se o host tiver registrado um. Sem esta ponte, o
 * grafo semeado por `SakuraBotFlow.seed.ts` fica inerte: nenhum código o executa. O quickcart
 * resolve isso com `FlowDriver.handleInbound`, plugado no mesmo hook — este arquivo é o
 * equivalente mínimo para o sakura, mais simples porque o grafo aqui é um único nó `action` em
 * self-loop (ver comentário de `SakuraBotFlow.seed.ts`).
 *
 * Por que `interpreter.step` e não `interpreter.run`: `run` avança em laço enquanto o passo devolver
 * `kind: 'advanced'`, e um nó de ação cujo handler devolve `next: node.id` (self-loop) SEMPRE
 * devolve `advanced` — nunca `awaiting-answer` (isso só existe para `question`/`menu`). Chamar
 * `run` aqui giraria `runBotEngine` várias vezes para UMA mensagem só, até o teto de passos. Uma
 * mensagem inbound é UM turno: `step` roda a ação exatamente uma vez e para, que é o que o
 * self-loop pretende dizer ("continue neste nó até a próxima mensagem"), não "continue agora".
 */

import type { ChannelAdapterInterface, ConversationSession, FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'
import type { FlowInterpreter, SessionRepository } from '@adatechnology/meta-whatsapp-module'
import { INCOMING_TEXT_CONTEXT_KEY } from './registerSakuraBotFlowActions'

export interface SakuraBotFlowDriverDependencies {
  readonly interpreter: FlowInterpreter
  readonly sessionRepository: SessionRepository
  readonly loadFlow: (key: string) => Promise<FlowGraphData | undefined>
  /** Sessão nova, sem `flowKey` ainda: é o grafo por onde ela deve entrar. */
  readonly defaultFlowKey: string
}

export interface HandleInboundParams {
  readonly companyId: string
  readonly whatsappNumber: string
  readonly text: string
  readonly session: ConversationSession
  readonly channel: ChannelAdapterInterface
}

export class SakuraBotFlowDriver {
  constructor(private readonly dependencies: SakuraBotFlowDriverDependencies) {}

  /**
   * `false` quando não há grafo para atender aquele `flowKey` — não deveria acontecer em operação
   * normal (`seedSakuraBotFlow` cria o grafo na primeira vez que o estabelecimento é atendido),
   * mas uma corrida entre o boot e a primeira mensagem, ou um `flowKey` apagado pelo painel, não
   * pode travar o atendimento: o chamador decide o que fazer sem grafo.
   */
  async handleInbound(params: HandleInboundParams): Promise<{ readonly handled: boolean }> {
    const { companyId, whatsappNumber, text, session, channel } = params

    const flowKey = session.flowKey ?? this.dependencies.defaultFlowKey

    const graph = await this.dependencies.loadFlow(flowKey)
    if (!graph) return { handled: false }

    const currentNodeId = session.currentNodeId ?? graph.startNodeId
    if (!graph.nodes[currentNodeId]) return { handled: false }

    const result = await this.dependencies.interpreter.step({
      graph,
      currentNodeId,
      context: { ...session.context, [INCOMING_TEXT_CONTEXT_KEY]: text },
      session,
      channel,
    })

    if (result.kind === 'advanced') {
      await this.dependencies.sessionRepository.setFlowPosition(companyId, whatsappNumber, flowKey, result.nodeId)
      await this.dependencies.sessionRepository.patchContext(companyId, whatsappNumber, result.context)
      return { handled: true }
    }

    // 'terminal' | 'awaiting-answer' | 'cross-flow': nenhum desses é esperado no grafo trivial do
    // sakura (um único nó de ação em self-loop não tem para onde mais ir). Solta a posição para a
    // próxima mensagem reentrar pelo início em vez de ficar presa num estado que este grafo não
    // produz — mais seguro que assumir silenciosamente que é `terminal`.
    await this.dependencies.sessionRepository.setFlowPosition(companyId, whatsappNumber, null, null)
    await this.dependencies.sessionRepository.patchContext(companyId, whatsappNumber, result.context)
    return { handled: true }
  }
}
