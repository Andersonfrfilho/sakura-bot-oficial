import { fakerPT_BR as faker } from '@faker-js/faker'

export { faker }

// Fixed seed keeps re-runs of `make hub-seed` deterministic — same demo names/phones/addresses every time.
export function seedFaker(): void {
  faker.seed(20260716)
}

export function brazilianWhatsappNumber(): string {
  const ddd = randomItem(['11', '16', '21', '31', '41', '51'])
  return `55${ddd}9${faker.string.numeric(8)}`
}

export function daysAgo(days: number, hours = 0): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(date.getHours() - hours)
  return date
}

export function randomItem<TItem>(items: readonly TItem[]): TItem {
  return faker.helpers.arrayElement(items)
}

export function randomInt(min: number, max: number): number {
  return faker.number.int({ min, max })
}

export function money(value: number): string {
  return value.toFixed(2)
}

export function requireItemAt<TItem>(items: readonly TItem[], index: number): TItem {
  const item = items[index]
  if (item === undefined) throw new Error(`[Seed] Index ${index} out of bounds (length ${items.length})`)
  return item
}
