/** Vocabulário das conversas compartilhado entre a borda HTTP e quem envia mensagem de fora do módulo. */

/** Estado inicial do fluxo do bot (o n8n é quem o conduz daqui em diante). */
export const CONVERSATION_START_STATE = 'start'

/** Remetente de toda mensagem disparada por um atendente do painel. */
export const CONVERSATION_AGENT_SENDER = 'agent' as const
