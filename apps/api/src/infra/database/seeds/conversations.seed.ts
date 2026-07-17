import { db } from '../connection'
import * as schema from '../schema'
import { daysAgo, faker } from './helpers/seed-helpers'

function sessionId(index: number): string {
  return `00000000-0000-0000-000e-${String(index).padStart(12, '0')}`
}

function messageId(index: number): string {
  return `00000000-0000-0000-000f-${String(index).padStart(12, '0')}`
}

const SCRIPTED_EXCHANGE = [
  { direction: 'in', sender: 'customer', content: 'Oi, gostaria de fazer um pedido' },
  { direction: 'out', sender: 'bot', content: 'Olá! Claro, aqui está nosso cardápio 🍣' },
  { direction: 'in', sender: 'customer', content: 'Quero 2 combos de sushi, pra entrega' },
  { direction: 'out', sender: 'bot', content: 'Perfeito! Pode me confirmar o endereço de entrega?' },
] as const

export async function seedConversations(establishmentId: string, atendenteUserId: string): Promise<void> {
  const customers = await db.query.customers.findMany({
    where: (customer, { eq }) => eq(customer.establishmentId, establishmentId),
    limit: 3,
  })
  if (customers.length === 0) return

  const sessions = customers.map((customer, index) => ({
    id: sessionId(index),
    establishmentId,
    whatsappNumber: customer.whatsappNumber,
    currentState: index === 0 ? 'human_handoff' : 'start',
    mode: index === 0 ? 'human' : 'bot',
    assignedUserId: index === 0 ? atendenteUserId : null,
    humanRequestedAt: index === 0 ? daysAgo(0, 1) : null,
    lastInboundAt: daysAgo(0, 1),
    lastActivity: daysAgo(0, 1),
  }))
  await db.insert(schema.conversationSessions).values(sessions).onConflictDoNothing()

  const messages: (typeof schema.conversationMessages.$inferInsert)[] = []
  customers.forEach((customer, customerIndex) => {
    SCRIPTED_EXCHANGE.forEach((exchange, exchangeIndex) => {
      messages.push({
        id: messageId(customerIndex * SCRIPTED_EXCHANGE.length + exchangeIndex),
        establishmentId,
        whatsappNumber: customer.whatsappNumber,
        direction: exchange.direction,
        sender: exchange.sender,
        type: 'text',
        content: exchange.content,
        waMessageId: faker.string.uuid(),
        createdAt: new Date(Date.now() - (SCRIPTED_EXCHANGE.length - exchangeIndex) * 5 * 60 * 1000),
      })
    })
  })
  await db.insert(schema.conversationMessages).values(messages).onConflictDoNothing()
}
