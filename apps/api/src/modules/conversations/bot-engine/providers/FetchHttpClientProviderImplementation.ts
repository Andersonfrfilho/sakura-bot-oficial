// Substitui N8nHttpClientProviderImplementation dentro do processo Bun: mesma interface, fetch nativo.

import type { HttpClientOptions, HttpClientProvider } from './contracts/HttpClientProvider.ts';

const DEFAULT_TIMEOUT_MILLISECONDS = 8000;

export class FetchHttpClientProviderImplementation implements HttpClientProvider {
  constructor(private readonly timeoutMilliseconds: number = DEFAULT_TIMEOUT_MILLISECONDS) {}

  async request<T = unknown>(options: HttpClientOptions): Promise<T | null> {
    try {
      const response = await fetch(options.url, {
        method: options.method,
        headers: options.headers ?? {},
        ...(options.body !== undefined
          ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) }
          : {}),
        signal: AbortSignal.timeout(this.timeoutMilliseconds),
      });
      if (!response.ok) return null;
      const raw = await response.text();
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      // Integração externa indisponível degrada para null, como no provider do n8n.
      return null;
    }
  }
}
