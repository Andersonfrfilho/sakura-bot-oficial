/**
 * Editor de fluxos. A tela é o `FlowsWorkspace` do pacote — canvas, mapa, paleta, painel de nó,
 * validação e posições vivas vêm de lá, iguais aos outros produtos (quickcart, financiamento).
 * Aqui fica só o que é nosso: as rotas da API e a chave do fluxo raiz.
 *
 * Fase 0 da migração do bot de n8n: o motor de fluxo está ligado (`flowEngine: true`) mas o grafo
 * `main` ainda não existe — o editor abre vazio até a Fase 2 desenhar o fluxo real. O n8n continua
 * processando o webhook da Meta normalmente até a Fase 3.
 */

import '@adatechnology/conversations-ui/styles.css'
import { FlowsWorkspace, type FlowsWorkspaceApi } from '@adatechnology/conversations-ui/flows'
import { flowsApi, ROOT_FLOW_KEY } from '@/lib/flowsApi'

const FLOWS_API: FlowsWorkspaceApi = {
  getGraphs: flowsApi.getAll,
  saveGraph: (key, graph) => flowsApi.save(key, graph),
  createFlow: flowsApi.create,
  deleteFlow: flowsApi.remove,
  getLivePositions: flowsApi.livePositions,
}

export function FlowsPage() {
  return <FlowsWorkspace api={FLOWS_API} rootFlowKey={ROOT_FLOW_KEY} />
}
