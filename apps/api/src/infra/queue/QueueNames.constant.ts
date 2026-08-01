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

export const STOCK_EXPIRY_ALERTS_QUEUE = 'stock-expiry-alerts' as const

export const STOCK_EXPIRY_JOB = {
  SCAN_EXPIRING: 'scan-expiring',
} as const

export type StockExpiryJobName = (typeof STOCK_EXPIRY_JOB)[keyof typeof STOCK_EXPIRY_JOB]

export const MEDIA_PROCESSING_QUEUE = 'media-processing' as const

export const MEDIA_PROCESSING_JOB = {
  RESIZE_IMAGE: 'resize-image',
  OPTIMIZE: 'optimize',
} as const

export type MediaProcessingJobName = (typeof MEDIA_PROCESSING_JOB)[keyof typeof MEDIA_PROCESSING_JOB]

export type MediaProcessingJobData = {
  type: MediaProcessingJobName
  key: string
}

export const FINANCE_DUE_ALERTS_QUEUE = 'finance-due-alerts' as const

export const FINANCE_DUE_JOB = {
  SCAN_DUE_ACCOUNTS: 'scan-due-accounts',
} as const

export type FinanceDueJobName = (typeof FINANCE_DUE_JOB)[keyof typeof FINANCE_DUE_JOB]

export const IFOOD_POLLING_QUEUE = 'ifood-polling' as const

export const IFOOD_POLLING_JOB = {
  POLL: 'poll',
} as const

export type IfoodPollingJobName = (typeof IFOOD_POLLING_JOB)[keyof typeof IFOOD_POLLING_JOB]
