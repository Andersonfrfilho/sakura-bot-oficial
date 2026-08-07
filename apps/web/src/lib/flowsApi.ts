/**
 * Cliente das rotas de fluxo (`/whatsapp/flows`). Contrapartida de `whatsappSettingsApi.ts` —
 * mesmo padrão de client cru sobre `api.ts`, mesmos tipos do `@adatechnology/conversations-ui/flows`
 * que o `FlowsWorkspace` consome diretamente.
 *
 * A listagem devolve só um resumo (`nodeCount`); o editor busca cada grafo completo porque o canvas
 * desenha a partir dos nós, não da contagem.
 */

import type { CreateFlowInput, FlowGraphData, FlowLivePosition } from '@adatechnology/conversations-ui/flows'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

// Fluxo raiz que a migração vai desenhar na Fase 2 — por ora não existe ainda, e o editor mostra
// o estado vazio até o grafo ser criado.
export const ROOT_FLOW_KEY = 'main'

export type FlowSummary = {
  readonly key: string
  readonly label: string
  readonly nodeCount: number
  readonly showInMenu: boolean
  readonly updatedAt: string
}

function accessToken(): string | undefined {
  return useAuthStore.getState().accessToken ?? undefined
}

export const flowsApi = {
  list: (): Promise<FlowSummary[]> => api.get<FlowSummary[]>('/whatsapp/flows', accessToken()),

  get: (key: string): Promise<FlowGraphData> =>
    api.get<FlowGraphData>(`/whatsapp/flows/${encodeURIComponent(key)}`, accessToken()),

  // `expectedVersion` sai do próprio grafo carregado: é assim que o servidor detecta que outra
  // pessoa gravou no meio da edição e responde 409 em vez de sobrescrever em silêncio.
  save: async (key: string, graph: FlowGraphData): Promise<void> => {
    await api.put(
      `/whatsapp/flows/${encodeURIComponent(key)}`,
      { graph, expectedVersion: graph.version },
      accessToken()
    )
  },

  create: async (input: CreateFlowInput): Promise<void> => {
    await api.post('/whatsapp/flows', input, accessToken())
  },

  remove: async (key: string): Promise<void> => {
    await api.delete(`/whatsapp/flows/${encodeURIComponent(key)}`, accessToken())
  },

  livePositions: (): Promise<FlowLivePosition[]> =>
    api.get<FlowLivePosition[]>('/whatsapp/flows/live-positions', accessToken()),

  // Busca os grafos completos em paralelo: em série, uma loja com muitos fluxos abriria o mapa em
  // N vezes o tempo de ida e volta.
  async getAll(): Promise<Record<string, FlowGraphData>> {
    const summaries = await flowsApi.list()
    const graphs = await Promise.all(summaries.map((summary) => flowsApi.get(summary.key)))

    return Object.fromEntries(graphs.map((graph) => [graph.key, graph]))
  },
}
