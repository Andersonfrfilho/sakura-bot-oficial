export interface ProductSuggestion {
  name: string
  brand?: string
  barcode?: string
  imageUrl?: string
  category?: string
}

type OpenFoodFactsSearchProduct = {
  product_name?: string
  brands?: string
  code?: string
  image_url?: string
  categories?: string
}

type OpenFoodFactsSearchResponse = {
  products?: OpenFoodFactsSearchProduct[]
}

type OpenFoodFactsLookupResponse = {
  status?: number
  product?: OpenFoodFactsSearchProduct
}

export class OpenFoodFactsProvider {
  private toSuggestion(product: OpenFoodFactsSearchProduct): ProductSuggestion {
    const suggestion: ProductSuggestion = {
      name: product.product_name ?? '',
    }
    if (product.brands) suggestion.brand = product.brands
    if (product.code) suggestion.barcode = product.code
    if (product.image_url) suggestion.imageUrl = product.image_url
    if (product.categories) suggestion.category = product.categories
    return suggestion
  }

  async search(query: string): Promise<ProductSuggestion[]> {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=10&search_simple=1`

    try {
      const response = await fetch(url)
      if (!response.ok) return []

      const data = (await response.json()) as OpenFoodFactsSearchResponse
      const products = data.products ?? []

      return products
        .filter((p) => p.product_name)
        .slice(0, 10)
        .map((p) => this.toSuggestion(p))
    } catch {
      return []
    }
  }

  async getByBarcode(barcode: string): Promise<ProductSuggestion | null> {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`

    try {
      const response = await fetch(url)
      if (!response.ok) return null

      const data = (await response.json()) as OpenFoodFactsLookupResponse
      if (data.status !== 1 || !data.product?.product_name) return null

      return this.toSuggestion(data.product)
    } catch {
      return null
    }
  }
}
