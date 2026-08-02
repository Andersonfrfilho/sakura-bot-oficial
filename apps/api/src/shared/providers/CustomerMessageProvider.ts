/**
 * Envio de mensagem ao cliente a partir de um caso de uso que não é do módulo de conversas.
 *
 * Existe para que pedidos (e futuros módulos) não importem o registry do meta-whatsapp-module:
 * o caminho de envio continua sendo um só — o adapter no container é quem o resolve.
 */

export type SendCustomerTextParams = {
  readonly establishmentId: string
  readonly whatsappNumber: string
  readonly body: string
  /** Atendente que disparou o envio; a mensagem nunca sai sem alguém por trás. */
  readonly agentUserId: string
}

export interface CustomerMessageProvider {
  sendText(params: SendCustomerTextParams): Promise<void>
}
