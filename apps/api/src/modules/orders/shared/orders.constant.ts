/** Textos e códigos do módulo de pedidos que aparecem em mais de um lugar. */

/** Ação registrada na trilha de auditoria ao pedir confirmação parcial ao cliente. */
export const PARTIAL_CONFIRMATION_AUDIT_ACTION = 'order.partial_confirmation_requested'

export const ORDER_RESOURCE_TYPE = 'order'

/** Status em que o pedido já não admite negociação de itens com o cliente. */
export const ORDER_CLOSED_STATUSES = ['completed', 'cancelled'] as const

export const PARTIAL_CONFIRMATION_MESSAGES = {
  greetingWithName: (customerName: string) => `Olá, ${customerName}!`,
  greetingWithoutName: 'Olá!',
  unavailableIntro: 'Infelizmente estes itens do seu pedido não estão disponíveis agora:',
  remainingIntro: 'O restante do pedido segue disponível:',
  // "dos itens" e não "do pedido": taxa de entrega não entra nesta soma.
  newTotal: (formattedTotal: string) => `Novo total dos itens disponíveis: ${formattedTotal}`,
  confirmationRequest:
    'Você confirma o pedido apenas com os itens disponíveis? Responda *SIM* para confirmar ou *NÃO* para cancelar.',
} as const

export const ORDER_ERROR_MESSAGES = {
  noCustomerWhatsapp: 'Pedido sem cliente com WhatsApp — não há para quem enviar a mensagem.',
  closedOrder: 'Pedido já concluído ou cancelado não aceita confirmação parcial.',
  unknownItems: 'Um ou mais itens informados não pertencem a este pedido.',
  allItemsUnavailable:
    'Todos os itens estão em falta — cancele o pedido em vez de pedir confirmação parcial.',
} as const
