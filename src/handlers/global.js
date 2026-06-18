// ═══════════════════════════════════════════════════════════════
// GLOBAL — Comandos que funcionam em qualquer estado
//   sair · cancelar
// ═══════════════════════════════════════════════════════════════
if (texto === 'sair' || texto === 'cancelar') {
  newState = 'start';
  newCart = { items: [], order_type: '', address: '', complement: '', delivery_fee: 0, payment_method: '', change_for: null, split_count: 0, split_current: 0, split_payments: [], mixed_method: '', mixed_label: '', mixed_amount: 0, address_street_temp: null, browse_category: '', browse_page: 0, pending_item_id: null, pending_item_name: '' };
  newReservationTemp = {};
  respostas.push('✅ Atendimento encerrado. Até logo! 👋');
