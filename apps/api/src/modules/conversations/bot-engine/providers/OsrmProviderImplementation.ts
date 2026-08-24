import type { OsrmResponse } from '../shared/botEngine.types.ts';
import type { HttpClientProvider } from './contracts/HttpClientProvider.ts';
import type { RouteResult, RoutingProvider } from './contracts/RoutingProvider.ts';

export class OsrmProviderImplementation implements RoutingProvider {
  constructor(private readonly http: HttpClientProvider) {}

  async route(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<RouteResult | null> {
    const data = await this.http.request<OsrmResponse>({
      method: 'GET',
      url: 'https://router.project-osrm.org/route/v1/driving/' + fromLng + ',' + fromLat + ';' + toLng + ',' + toLat + '?overview=false',
      headers: { 'User-Agent': 'SakuraBot/1.0' },
    });
    const firstRoute = data?.routes?.[0];
    if (firstRoute) {
      return { km: firstRoute.distance / 1000, min: Math.round(firstRoute.duration / 60) };
    }
    return null;
  }
}
