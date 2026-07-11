export const FISCAL_QUEUE = 'fiscal' as const

export const FISCAL_JOB = {
  EMIT: 'emit',
  DELIVER: 'deliver',
  SWEEP: 'sweep',
} as const

export type FiscalJobName = (typeof FISCAL_JOB)[keyof typeof FISCAL_JOB]

export type FiscalEmitJobData = {
  fiscalDocumentId: string
  establishmentId: string
}

export type FiscalDeliverJobData = {
  fiscalDocumentId: string
}

export type FiscalSweepJobData = Record<string, never>

export type FiscalJobData = FiscalEmitJobData | FiscalDeliverJobData | FiscalSweepJobData
