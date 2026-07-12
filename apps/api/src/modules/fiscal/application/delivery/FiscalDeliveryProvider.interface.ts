export type FiscalDeliveryChannel = 'whatsapp' | 'email'

export type FiscalDeliveryPayload = {
  readonly to: string // phone (whatsapp) or e-mail address
  readonly customerName?: string | undefined
  readonly publicUrl: string
  readonly numeroDocumento: number | null
  readonly chaveAcesso: string | null
  readonly pdfUrl?: string | undefined
}

export type FiscalDeliveryResult = {
  readonly ok: boolean
  readonly error?: string
}

export type FiscalDeliveryProvider = {
  readonly channel: FiscalDeliveryChannel
  deliver(payload: FiscalDeliveryPayload): Promise<FiscalDeliveryResult>
}

export function buildFiscalDeliveryMessage(payload: FiscalDeliveryPayload): string {
  const greeting = payload.customerName ? `Olá, ${payload.customerName}! ` : ''
  return `${greeting}Sua nota fiscal${buildFiscalDeliverySuffix(payload)} está disponível: ${payload.publicUrl}`
}

export function buildFiscalDeliverySubject(payload: FiscalDeliveryPayload): string {
  return `Sua nota fiscal${buildFiscalDeliverySuffix(payload)}`
}

function buildFiscalDeliverySuffix(payload: FiscalDeliveryPayload): string {
  return payload.numeroDocumento ? ` nº ${payload.numeroDocumento}` : ''
}
