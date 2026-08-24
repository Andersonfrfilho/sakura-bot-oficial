/**
 * Copyright (c) 2026 Ada Technology. All rights reserved.
 *
 * This source code is proprietary and confidential. Unauthorized copying,
 * modification, distribution, or use of this file, via any medium, is
 * strictly prohibited without prior written permission from Ada Technology.
 *
 * Author: Anderson Filho <andersonfrfilho@gmail.com>
 *
 * Traduz `OutgoingMessage` (formato interno da engine) para `ChannelAdapterInterface`, que só
 * expõe texto, mídia, template e lista interativa — sem botão de resposta rápida nem localização.
 * Botão e localização caem para texto formatado: perdem a UI nativa, mas preservam a informação.
 */

import type { ChannelAdapterInterface } from '@adatechnology/meta-whatsapp-contracts'
import type { OutgoingMessage } from '../shared/botEngine.types'

const MAX_LIST_SECTION_ROWS = 10

function toListSections(message: Extract<OutgoingMessage, { type: 'list' }>) {
  return message.sections.map((section) => ({
    title: section.title,
    rows: section.rows.slice(0, MAX_LIST_SECTION_ROWS).map((row) => ({ id: row.id, title: row.title })),
  }))
}

async function sendOne(channel: ChannelAdapterInterface, whatsappNumber: string, message: OutgoingMessage): Promise<void> {
  if (typeof message === 'string') {
    await channel.sendText(whatsappNumber, message)
    return
  }

  if (message.type === 'buttons') {
    const optionsText = message.buttons.map((button) => `• ${button.title}`).join('\n')
    await channel.sendText(whatsappNumber, `${message.body}\n\n${optionsText}`)
    return
  }

  if (message.type === 'list') {
    await channel.sendInteractiveList({
      to: whatsappNumber,
      body: message.body,
      buttonLabel: message.button,
      rows: toListSections(message).flatMap((section) => section.rows),
    })
    return
  }

  if (message.type === 'text_menu') {
    const items = message.items.map((item) => `${item.num}. ${item.name}`).join('\n')
    await channel.sendText(whatsappNumber, `${message.body}\n\n${items}`)
    return
  }

  const mapsLink = `https://maps.google.com/?q=${message.latitude},${message.longitude}`
  await channel.sendText(whatsappNumber, `${message.name}\n${message.address}\n${mapsLink}`)
}

export async function sendOutgoingMessages(
  channel: ChannelAdapterInterface,
  whatsappNumber: string,
  messages: readonly OutgoingMessage[]
): Promise<void> {
  // Sequencial de propósito: a ordem das mensagens é parte da conversa (ex.: aviso antes do
  // resumo do carrinho) — `Promise.all` embaralharia a ordem de chegada no WhatsApp.
  for (const message of messages) {
    await sendOne(channel, whatsappNumber, message)
  }
}
