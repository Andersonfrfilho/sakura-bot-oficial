import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { Category } from '@/infra/database/schema'
import { ConflictError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>

interface CreateCategoryInput {
  establishmentId: string
  name: string
  sortOrder?: number
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export class CreateCategoryUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: CreateCategoryInput): Promise<Category> {
    const slug = toSlug(input.name)

    const existing = await this.db.query.categories.findFirst({
      where: and(
        eq(schema.categories.establishmentId, input.establishmentId),
        eq(schema.categories.slug, slug)
      ),
    })

    if (existing) {
      throw new ConflictError(`Category with slug '${slug}' already exists`)
    }

    const [created] = await this.db
      .insert(schema.categories)
      .values({
        establishmentId: input.establishmentId,
        name: input.name,
        slug,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning()

    return created!
  }
}
