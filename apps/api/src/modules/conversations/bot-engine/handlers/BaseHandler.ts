import type { BotEngineContext } from '../BotEngineContext.ts';

export abstract class BaseHandler {
  constructor(protected readonly context: BotEngineContext) {}

  abstract handle(): Promise<boolean>;
}
