import {
  createWhatsAppProvider,
  WhatsAppError,
  WhatsAppConfigError,
  WhatsAppConnectionError,
  WhatsAppTimeoutError,
  WhatsAppWindowExpiredError,
  WhatsAppTemplateDuplicateError,
  WhatsAppRejectionError,
  type WhatsAppProvider,
  type SendMessageResult,
  type SendMediaParams,
  type SendTemplateParams,
  type FetchMediaResult,
} from '@adatechnology/whatsapp-provider'

import { AppError } from '@/shared/errors/AppError'

function mapWhatsAppError(error: WhatsAppError): AppError {
  if (error instanceof WhatsAppConfigError) return new AppError(error.message, error.code, 503)
  if (error instanceof WhatsAppConnectionError) return new AppError(error.message, error.code, 503)
  if (error instanceof WhatsAppTimeoutError) return new AppError(error.message, error.code, 504)
  if (error instanceof WhatsAppWindowExpiredError) return new AppError(error.message, error.code, 422, error.rawResponse)
  if (error instanceof WhatsAppTemplateDuplicateError) return new AppError(error.message, error.code, 409, error.rawResponse)
  if (error instanceof WhatsAppRejectionError) return new AppError(error.message, error.code, 422, error.rawResponse)
  return new AppError(error.message, error.code, 502, error.rawResponse)
}

async function withErrorTranslation<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation()
  } catch (error) {
    throw error instanceof WhatsAppError ? mapWhatsAppError(error) : error
  }
}

export class WhatsAppSender {
  private readonly provider: WhatsAppProvider

  constructor() {
    this.provider = createWhatsAppProvider({
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      businessId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
    })
  }

  sendText(to: string, body: string): Promise<SendMessageResult> {
    return withErrorTranslation(() => this.provider.messages.sendText(to, body))
  }

  sendMedia(params: SendMediaParams): Promise<SendMessageResult> {
    return withErrorTranslation(() => this.provider.messages.sendMedia(params))
  }

  sendTemplate(params: SendTemplateParams): Promise<SendMessageResult> {
    return withErrorTranslation(() => this.provider.messages.sendTemplate(params))
  }

  fetchMediaAsBase64(mediaId: string): Promise<FetchMediaResult> {
    return withErrorTranslation(() => this.provider.messages.fetchMediaAsBase64(mediaId))
  }
}
