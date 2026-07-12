export type FiscalCupomItem = {
  readonly descricao: string
  readonly quantidade: number
  readonly valorUnitario: number
  readonly valorTotal: number
}

export type FiscalCupomData = {
  readonly razaoSocial: string
  readonly cnpj: string
  readonly numeroDocumento: number | null
  readonly serie: string | null
  readonly chaveAcesso: string | null
  readonly qrCodeUrl: string | null
  readonly items: ReadonlyArray<FiscalCupomItem>
  readonly total: number
}

export type PrintResult = {
  readonly ok: boolean
  readonly error?: string
}

export type PrinterProvider = {
  print(cupom: FiscalCupomData): Promise<PrintResult>
}

function money(value: number): string {
  return value.toFixed(2)
}

function formatChave(chave: string | null): string {
  return chave ? chave.replace(/(.{4})/g, '$1 ').trim() : '-'
}

// Pure, testable plain-text cupom — used as a preview/fallback. The thermal provider renders the
// real ESC/POS version (with the QR code) from the same FiscalCupomData.
export function buildFiscalCupomText(cupom: FiscalCupomData): string {
  const lines: string[] = []
  lines.push(cupom.razaoSocial)
  lines.push(`CNPJ: ${cupom.cnpj}`)
  lines.push('--------------------------------')
  lines.push(`NFC-e ${cupom.numeroDocumento ?? '-'}  Serie ${cupom.serie ?? '-'}`)
  lines.push('--------------------------------')
  for (const item of cupom.items) {
    lines.push(`${item.quantidade}x ${item.descricao}`)
    lines.push(`   ${money(item.valorUnitario)}  =  ${money(item.valorTotal)}`)
  }
  lines.push('--------------------------------')
  lines.push(`TOTAL: R$ ${money(cupom.total)}`)
  lines.push('--------------------------------')
  lines.push(`Chave de acesso:`)
  lines.push(formatChave(cupom.chaveAcesso))
  if (cupom.qrCodeUrl) lines.push('Consulte pela chave ou QR Code')
  return lines.join('\n')
}
