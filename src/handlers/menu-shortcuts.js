// ═══════════════════════════════════════════════════════════════
// MENU SHORTCUTS — Atalhos globais (protegidos por !expectingRawInput)
//   1/cardápio · 2/pedido · 3/reserva
//   4/atendente · 5/meu pedido · 6/notificações · 0/voltar
// ═══════════════════════════════════════════════════════════════
} else if (!expectingRawInput && (texto === '1' || texto.includes('cardapio') || texto.includes('cardápio') || texto.includes('menu'))) {
  newState = 'ordering_cat'; respostas.push(categoryList('order'));

} else if (!expectingRawInput && (texto === '2' || (texto.includes('pedido') && texto !== 'meu pedido' && !texto.startsWith('meus pedido')) || texto.includes('pedir'))) {
  newState = 'ordering_cat'; respostas.push(categoryList('order'));

} else if (!expectingRawInput && (texto === '3' || texto.includes('reserva') || texto.includes('reservar')) && !['reserving','confirming_reservation'].includes(currentState)) {
  newState = 'reserving';
  respostas.push('📅 *Reserva de Mesa*\n\nInforme data, horário e número de pessoas:\n\nEx: _Sábado às 20h para 4 pessoas_\nOu: _12/06 às 20h, 4 pessoas_');
