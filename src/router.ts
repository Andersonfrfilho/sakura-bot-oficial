// ── Fechado? Retorno antecipado ───────────────────────────────────────────────
if (!isOpen) {
  _earlyResponse = {
    tel, instancia,
    respostas: [msgClosed],
    state: currentState,
    cart: currentCart,
    reservation_temp: newReservationTemp,
    save_order: false, order: null,
    save_reservation: false, reservation: null,
    save_customer_name: false, customer_name_to_save: null,
    save_marketing_opt_in: false, marketing_opt_in_value: null,
    kitchen_phone: '',
    create_chatwoot_conversation: false,
    chatwoot_customer_name: customerName || '',
  };
}

// ── Chain of Responsibility ───────────────────────────────────────────────────
async function runHandlers(): Promise<void> {
  if (_earlyResponse) return;

  const handlers: BaseHandler[] = [
    new GlobalHandler(),
    new GreetingHandler(),
    new CartHandler(),
    new DeliveryHandler(),
    new PaymentHandler(),
    new MenuShortcutsHandler(),
    new ReservationHandler(),
    new MiscHandler(),
    new OrderingHandler(),
    new FallbackHandler(),
  ];

  for (const handler of handlers) {
    if (_earlyResponse) break;
    const handled = await handler.handle();
    if (handled) break;
  }
}

// @ts-ignore — n8n executa jsCode dentro de uma async function; await é válido em runtime
await runHandlers();
