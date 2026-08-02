import { eq, and, asc } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import * as schema from '@/infra/database/schema'
import { UnauthorizedError, ValidationError, NotFoundError, ConflictError } from '@/shared/errors/AppError'
import type { CacheProvider } from '@/shared/providers/CacheProvider'
import { OpenFoodFactsProvider } from '@/shared/providers/OpenFoodFactsProvider'
import { parseMultipart } from '@/shared/utils/parseMultipart'
import { parseProductsCsv } from '../../application/parseProductsCsv'

type Database = NodePgDatabase<typeof schema>

const catalogSchema = z.object({
  name: z.string().min(1).max(100),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  ncmCode: z.string().max(8).optional(),
  cfopCode: z.string().max(4).optional(),
  cstIcms: z.string().max(3).optional(),
})

const productSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  price: z.number().positive(),
  costPrice: z.number().positive().nullable().optional(),
  unit: z.enum(['un', 'kg', 'g', 'l', 'ml']).optional(),
  barcode: z.string().max(20).nullable().optional(),
  catalogId: z.string().uuid().nullable().optional(),
  sectionId: z.string().uuid().nullable().optional(),
  preparationTimeMinutes: z.number().int().positive().nullable().optional(),
  preparationInstructions: z.string().nullable().optional(),
  active: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
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
  private readonly openFoodFacts = new OpenFoodFactsProvider()

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

  // ── Catalogs ────────────────────────────────────────────────────────────

  listCatalogs: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const cats = await this.db
      .select()
      .from(schema.catalogs)
      .where(eq(schema.catalogs.establishmentId, establishmentId))
      .orderBy(asc(schema.catalogs.sortOrder), asc(schema.catalogs.name))

    response.json(cats)
  }

  createCatalog: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const parsed = catalogSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const slug = toSlug(parsed.data.name)

    const existing = await this.db.query.catalogs.findFirst({
      where: and(
        eq(schema.catalogs.establishmentId, establishmentId),
        eq(schema.catalogs.slug, slug)
      ),
      columns: { id: true },
    })
    if (existing) throw new ConflictError('Catálogo com esse nome já existe')

    const [cat] = await this.db
      .insert(schema.catalogs)
      .values({
        establishmentId,
        name: parsed.data.name,
        slug,
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
        ...(parsed.data.ncmCode !== undefined && { ncmCode: parsed.data.ncmCode }),
        ...(parsed.data.cfopCode !== undefined && { cfopCode: parsed.data.cfopCode }),
        ...(parsed.data.cstIcms !== undefined && { cstIcms: parsed.data.cstIcms }),
      })
      .returning()

    await this.invalidateCache(establishmentId)
    response.json(cat, 201)
  }

  updateCatalog: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const parsed = catalogSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const existing = await this.db.query.catalogs.findFirst({
      where: and(
        eq(schema.catalogs.id, id),
        eq(schema.catalogs.establishmentId, establishmentId)
      ),
    })
    if (!existing) throw new NotFoundError('Catálogo')

    const slug = toSlug(parsed.data.name)

    if (slug !== existing.slug) {
      const conflict = await this.db.query.catalogs.findFirst({
        where: and(
          eq(schema.catalogs.establishmentId, establishmentId),
          eq(schema.catalogs.slug, slug)
        ),
        columns: { id: true },
      })
      if (conflict) throw new ConflictError('Catálogo com esse nome já existe')
    }

    const [updated] = await this.db
      .update(schema.catalogs)
      .set({
        name: parsed.data.name,
        slug,
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
        ...(parsed.data.ncmCode !== undefined && { ncmCode: parsed.data.ncmCode }),
        ...(parsed.data.cfopCode !== undefined && { cfopCode: parsed.data.cfopCode }),
        ...(parsed.data.cstIcms !== undefined && { cstIcms: parsed.data.cstIcms }),
      })
      .where(and(eq(schema.catalogs.id, id), eq(schema.catalogs.establishmentId, establishmentId)))
      .returning()

    await this.invalidateCache(establishmentId)
    response.json(updated)
  }

  deleteCatalog: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const existing = await this.db.query.catalogs.findFirst({
      where: and(
        eq(schema.catalogs.id, id),
        eq(schema.catalogs.establishmentId, establishmentId)
      ),
      columns: { id: true },
    })
    if (!existing) throw new NotFoundError('Catálogo')

    // Produtos ficam sem catálogo (catalogId → null via ON DELETE SET NULL)
    await this.db
      .delete(schema.catalogs)
      .where(and(eq(schema.catalogs.id, id), eq(schema.catalogs.establishmentId, establishmentId)))

    await this.invalidateCache(establishmentId)
    response.json({ success: true }, 200)
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
        ...(parsed.data.costPrice !== undefined && { costPrice: parsed.data.costPrice === null ? null : String(parsed.data.costPrice) }),
        ...(parsed.data.unit !== undefined && { unit: parsed.data.unit }),
        ...(parsed.data.barcode !== undefined && { barcode: parsed.data.barcode }),
        ...(parsed.data.catalogId !== undefined && { catalogId: parsed.data.catalogId }),
        ...(parsed.data.sectionId !== undefined && { sectionId: parsed.data.sectionId }),
        ...(parsed.data.preparationTimeMinutes !== undefined && { preparationTimeMinutes: parsed.data.preparationTimeMinutes }),
        ...(parsed.data.preparationInstructions !== undefined && { preparationInstructions: parsed.data.preparationInstructions }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.allowNegativeStock !== undefined && { allowNegativeStock: parsed.data.allowNegativeStock }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      })
      .returning()

    await this.invalidateCache(establishmentId)
    response.json(prod, 201)
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
        ...(parsed.data.costPrice !== undefined && { costPrice: parsed.data.costPrice === null ? null : String(parsed.data.costPrice) }),
        ...(parsed.data.unit !== undefined && { unit: parsed.data.unit }),
        ...(parsed.data.barcode !== undefined && { barcode: parsed.data.barcode }),
        ...(parsed.data.catalogId !== undefined && { catalogId: parsed.data.catalogId }),
        ...(parsed.data.sectionId !== undefined && { sectionId: parsed.data.sectionId }),
        ...(parsed.data.preparationTimeMinutes !== undefined && { preparationTimeMinutes: parsed.data.preparationTimeMinutes }),
        ...(parsed.data.preparationInstructions !== undefined && { preparationInstructions: parsed.data.preparationInstructions }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.allowNegativeStock !== undefined && { allowNegativeStock: parsed.data.allowNegativeStock }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      })
      .where(and(eq(schema.products.id, id), eq(schema.products.establishmentId, establishmentId)))
      .returning()

    // Preço é o único campo com histórico: é o que o gerente precisa responder
    // "quando esse item subiu", e o dado deixa de existir se não for gravado aqui.
    if (updated && Number(existing.price) !== Number(updated.price)) {
      await this.db.insert(schema.productPriceHistory).values({
        establishmentId,
        productId: id,
        userId: request.user.id,
        previousPrice: existing.price,
        newPrice: updated.price,
      })
    }

    await this.invalidateCache(establishmentId)
    response.json(updated)
  }

  getProductPriceHistory: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user
    const id = request.params['id']!

    const existing = await this.db.query.products.findFirst({
      where: and(eq(schema.products.id, id), eq(schema.products.establishmentId, establishmentId)),
      columns: { id: true },
    })
    if (!existing) throw new NotFoundError('Produto')

    const history = await this.db.query.productPriceHistory.findMany({
      where: and(
        eq(schema.productPriceHistory.productId, id),
        eq(schema.productPriceHistory.establishmentId, establishmentId)
      ),
      orderBy: (row, { desc }) => [desc(row.createdAt)],
      with: { user: { columns: { id: true, name: true } } },
    })

    response.json(history)
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
    response.json({ success: true }, 200)
  }

  bulkImportProducts: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const contentType = request.headers['content-type'] ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new ValidationError('Content-Type deve ser multipart/form-data')
    }

    const parsed = parseMultipart(request.rawBody, contentType)
    const csvFile = parsed.files[0]
    if (!csvFile) throw new ValidationError('Nenhum arquivo enviado no campo "file"')

    const { rows, errors } = parseProductsCsv(csvFile.buffer.toString('utf-8'))

    const catalogs = await this.db.query.catalogs.findMany({
      where: eq(schema.catalogs.establishmentId, establishmentId),
      columns: { id: true, name: true },
    })
    const catalogIdByName = new Map(catalogs.map((catalog) => [catalog.name.toLowerCase(), catalog.id]))

    let succeeded = 0

    for (const row of rows) {
      const slug = toSlug(row.name)

      const existing = await this.db.query.products.findFirst({
        where: and(
          eq(schema.products.establishmentId, establishmentId),
          eq(schema.products.slug, slug)
        ),
        columns: { id: true },
      })
      if (existing) {
        errors.push({ row: row.row, message: `Produto "${row.name}" já existe` })
        continue
      }

      await this.db.insert(schema.products).values({
        establishmentId,
        name: row.name,
        slug,
        price: String(row.price),
        ...(row.description && { description: row.description }),
        ...(row.unit && { unit: row.unit }),
        ...(row.barcode && { barcode: row.barcode }),
        ...(row.catalogName && { catalogId: catalogIdByName.get(row.catalogName.toLowerCase()) ?? null }),
      })

      succeeded += 1
    }

    if (succeeded > 0) await this.invalidateCache(establishmentId)

    response.json({ succeeded, failed: errors.length, errors }, 201)
  }

  productSearch: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const query = request.query['q'] ?? ''
    if (query.length < 2) {
      response.json([])
      return
    }
    const suggestions = await this.openFoodFacts.search(query)
    response.json(suggestions)
  }

  productLookup: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const barcode = request.params['barcode']!
    const suggestion = await this.openFoodFacts.getByBarcode(barcode)
    if (!suggestion) throw new NotFoundError('Produto')
    response.json(suggestion)
  }
}
