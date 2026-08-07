import type { CepResponse } from '../../shared/botEngine.types.ts';

export interface CepProvider {
  lookup(cep: string): Promise<CepResponse | null>;
}
