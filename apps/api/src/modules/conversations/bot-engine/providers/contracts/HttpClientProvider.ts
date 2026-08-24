export type HttpClientOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
};

export interface HttpClientProvider {
  request<T = unknown>(options: HttpClientOptions): Promise<T | null>;
}
