import type { NominatimResult, NominatimReverseResult } from '../../shared/botEngine.types.ts';

export interface GeocodingProvider {
  search(query: string): Promise<NominatimResult | null>;
  reverse(lat: number, lng: number): Promise<NominatimReverseResult | null>;
}
