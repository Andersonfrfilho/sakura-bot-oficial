// Porte mecânico de src/router.ts + src/teardown.ts: a cadeia de handlers passa a receber o
// contexto explicitamente em vez de fechar sobre variáveis globais do script do n8n.

import { BotEngineContext, type BotEngineContextParams } from './BotEngineContext.ts';
import { BaseHandler } from './handlers/BaseHandler.ts';
import { CartHandler } from './handlers/CartHandler.ts';
import { DeliveryHandler } from './handlers/DeliveryHandler.ts';
import { FallbackHandler } from './handlers/FallbackHandler.ts';
import { GlobalHandler } from './handlers/GlobalHandler.ts';
import { GreetingHandler } from './handlers/GreetingHandler.ts';
import { MenuShortcutsHandler } from './handlers/MenuShortcutsHandler.ts';
import { MiscHandler } from './handlers/MiscHandler.ts';
import { OrderingHandler } from './handlers/OrderingHandler.ts';
import { PaymentHandler } from './handlers/PaymentHandler.ts';
import { ReservationHandler } from './handlers/ReservationHandler.ts';
import type { BotEngineResult } from './shared/botEngine.types.ts';

export type RunBotEngineParams = BotEngineContextParams;

function buildHandlerChain(context: BotEngineContext): BaseHandler[] {
  return [
    new GlobalHandler(context),
    new GreetingHandler(context),
    new CartHandler(context),
    new DeliveryHandler(context),
    new PaymentHandler(context),
    new MenuShortcutsHandler(context),
    new ReservationHandler(context),
    new MiscHandler(context),
    new OrderingHandler(context),
    new FallbackHandler(context),
  ];
}

export async function runBotEngine(params: RunBotEngineParams): Promise<BotEngineResult> {
  const context = new BotEngineContext(params);

  if (!context.isOpen) {
    return {
      tel: context.tel,
      instancia: context.instancia,
      respostas: [context.msgClosed],
      state: context.currentState,
      cart: context.currentCart,
      reservation_temp: context.newReservationTemp,
      save_order: false,
      order: null,
      save_reservation: false,
      reservation: null,
      save_customer_name: false,
      customer_name_to_save: null,
      save_marketing_opt_in: false,
      marketing_opt_in_value: null,
      kitchen_phone: '',
      request_human_handoff: false,
      handoff_customer_name: context.customerName || '',
    };
  }

  for (const handler of buildHandlerChain(context)) {
    if (context.earlyResponse) break;
    const handled = await handler.handle();
    if (handled) break;
  }

  return context.earlyResponse ?? context.buildPayload();
}
