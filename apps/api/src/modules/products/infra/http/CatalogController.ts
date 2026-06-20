import { eq, and, asc } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import * as schema from '@/infra/database/schema'
import { UnauthorizedError, ValidationError, NotFoundError, ConflictError } from '@/shared/errors/AppError'
import type { CacheProvider } from '@/shared/providers/CacheProvider'

type Database = NodePgDatabase<typeof schema>

const categorySchema = z.object({
  name: z.string().min(1).max(100),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

const productSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  price: z.number().positive(),
  categoryId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export class CatalogController {
  constructor(
    private readonly db: Database,
    private readonly cache: CacheProvider
  ) {}

  private async invalidateCache(establishmentId: string): Promise<void> {
    await Promise.all([
      this.cache.delete(`products:list:${establishmentId}:true`),
      this.cache.delete(`products:list:${establishmentId}:false`),
      this.cache.delete(`menu:${establishmentId}`),
    ])
  }

  // ── Categories ────────────────────────────────────────────────────────────

  listCategories: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const cats = await this.db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.establishmentId, establishmentId))
      .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name))

    response.json(cats)
  }

  createCategory: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const parsed = categorySchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const slug = toSlug(parsed.data.name)

    const existing = await this.db.query.categories.findFirst({
      where: and(
        eq(schema.categories.establishmentId, establishmentId),
        eq(schema.categories.slug, slug)
      ),
      columns: { id: true },
    })
    if (existing) throw new ConflictError('Categoria com esse nome já existe')

    const [cat] = await this.db
      .insert(schema.categories)
      .values({
        establishmentId,
        name: parsed.data.name,
        slug,
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      })
      .returning()

    await this.invalidateCache(establishmentId)
    response.status(201).json(cat)
  }

  updateCategory: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const parsed = categorySchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const existing = await this.db.query.categories.findFirst({
      where: and(
        eq(schema.categories.id, id),
        eq(schema.categories.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Categoria')

    const slug = toSlug(parsed.data.name)

    if (slug !== existing.slug) {
      const conflict = await this.db.query.categories.findFirst({
        where: and(
          eq(schema.categories.establishmentId, establishmentId),
          eq(schema.categories.slug, slug)
        ),
        columns: { id: true },
      })
      if (conflict) throw new ConflictError('Categoria com esse nome já existe')
    }

    const [updated] = await this.db
      .update(schema.categories)
      .set({
        name: parsed.data.name,
        slug,
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      })
      .where(and(eq(schema.categories.id, id), eq(schema.categories.establishmentId, establishmentId)))
      .returning()

    await this.invalidateCache(establishmentId)
    response.json(updated)
  }

  deleteCategory: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const existing = await this.db.query.categories.findFirst({
      where: and(
        eq(schema.categories.id, id),
        eq(schema.categories.establishmentId, establishmentId)
      ),
      columns: { id: true },
    })
    if (!existing) throw new NotFoundError('Categoria')

    // Products become uncategorized (categoryId → null via ON DELETE SET NULL)
    await this.db
      .delete(schema.categories)
      .where(and(eq(schema.categories.id, id), eq(schema.categories.establishmentId, establishmentId)))

    await this.invalidateCache(establishmentId)
    response.status(204).end()
  }

  // ── Products ──────────────────────────────────────────────────────────────

  listProducts: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const prods = await this.db
      .select()
      .from(schema.products)
      .where(eq(schema.products.establishmentId, establishmentId))
      .orderBy(asc(schema.products.sortOrder), asc(schema.products.name))

    response.json(prods)
  }

  createProduct: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const parsed = productSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const slug = toSlug(parsed.data.name)

    const existing = await this.db.query.products.findFirst({
      where: and(
        eq(schema.products.establishmentId, establishmentId),
        eq(schema.products.slug, slug)
      ),
      columns: { id: true },
    })
    if (existing) throw new ConflictError('Produto com esse nome já existe')

    const [prod] = await this.db
      .insert(schema.products)
      .values({
        establishmentId,
        name: parsed.data.name,
        slug,
        price: String(parsed.data.price),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.categoryId !== undefined && { categoryId: parsed.data.categoryId }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      })
      .returning()

    await this.invalidateCache(establishmentId)
    response.status(201).json(prod)
  }

  updateProduct: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const parsed = productSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const existing = await this.db.query.products.findFirst({
      where: and(
        eq(schema.products.id, id),
        eq(schema.products.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Produto')

    const slug = toSlug(parsed.data.name)

    if (slug !== existing.slug) {
      const conflict = await this.db.query.products.findFirst({
        where: and(
          eq(schema.products.establishmentId, establishmentId),
          eq(schema.products.slug, slug)
        ),
        columns: { id: true },
      })
      if (conflict) throw new ConflictError('Produto com esse nome já existe')
    }

    const [updated] = await this.db
      .update(schema.products)
      .set({
        name: parsed.data.name,
        slug,
        price: String(parsed.data.price),
        updatedAt: new Date(),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.categoryId !== undefined && { categoryId: parsed.data.categoryId }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      })
      .where(and(eq(schema.products.id, id), eq(schema.products.establishmentId, establishmentId)))
      .returning()

    await this.invalidateCache(establishmentId)
    response.json(updated)
  }

  toggleProductActive: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const existing = await this.db.query.products.findFirst({
      where: and(
        eq(schema.products.id, id),
        eq(schema.products.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Produto')

    const [updated] = await this.db
      .update(schema.products)
      .set({ active: !existing.active, updatedAt: new Date() })
      .where(and(eq(schema.products.id, id), eq(schema.products.establishmentId, establishmentId)))
      .returning()

    await this.invalidateCache(establishmentId)
    response.json(updated)
  }

  deleteProduct: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const existing = await this.db.query.products.findFirst({
      where: and(
        eq(schema.products.id, id),
        eq(schema.products.establishmentId, establishmentId)
      ),
      columns: { id: true },
    })
    if (!existing) throw new NotFoundError('Produto')

    await this.db
      .delete(schema.products)
      .where(and(eq(schema.products.id, id), eq(schema.products.establishmentId, establishmentId)))

    await this.invalidateCache(establishmentId)
    response.status(204).end()
  }
}
