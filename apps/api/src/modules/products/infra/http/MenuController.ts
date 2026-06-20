import { eq, and, asc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import * as schema from '@/infra/database/schema'
import { UnauthorizedError } from '@/shared/errors/AppError'
import type { CacheProvider } from '@/shared/providers/CacheProvider'

type Database = NodePgDatabase<typeof schema>

export class MenuController {
  constructor(
    private readonly db: Database,
    private readonly cache: CacheProvider
  ) {}

  getMenu: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const cacheKey = `menu:${establishmentId}`
    const cached = await this.cache.get(cacheKey)
    if (cached) {
      response.json(JSON.parse(cached))
      return
    }

    const [cats, prods] = await Promise.all([
      this.db
        .select()
        .from(schema.categories)
        .where(and(eq(schema.categories.establishmentId, establishmentId), eq(schema.categories.active, true)))
        .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name)),
      this.db
        .select()
        .from(schema.products)
        .where(and(eq(schema.products.establishmentId, establishmentId), eq(schema.products.active, true)))
        .orderBy(asc(schema.products.sortOrder), asc(schema.products.name)),
    ])

    const prodsByCategory: Record<string, typeof prods> = {}
    for (const p of prods) {
      const key = p.categoryId ?? '__none__'
      if (!prodsByCategory[key]) prodsByCategory[key] = []
      prodsByCategory[key].push(p)
    }

    const menu = {
      categories: cats.map((c) => ({
        id: c.id,
        name: c.name,
        products: prodsByCategory[c.id] ?? [],
      })),
      uncategorized: prodsByCategory['__none__'] ?? [],
    }

    await this.cache.set(cacheKey, JSON.stringify(menu), 60)
    response.json(menu)
  }
}
