// ═══════════════════════════════════════════════════════════════
// CART — Repeat order, carrinho, finalizar, confirmar
// ═══════════════════════════════════════════════════════════════
} else if (texto === 'sim' && currentState === 'repeat_order') {
  if (lastOrder && Array.isArray(lastOrder.items)) {
    const items = lastOrder.items.map(item => {
      const p = products.find(p => p.id === item.id);
      return p ? { id: p.id, name: p.name, qty: item.qty, price: Number(p.price), menuIdx: products.indexOf(p) + 1 } : null;
    }).filter(Boolean);
    newCart.items = items;
    newState = 'ordering';
    const { lines, total } = cartSummary(items);
    respostas.push('✅ *Pedido repetido!*\n\n' + lines.join('\n') + '\n\n*Total: R$ ' + fmtBRL(total) + '*\n\nDigite mais itens, *carrinho* para ver o resumo, *finalizar* para concluir ou *0* para voltar.');
  } else {
    newState = 'start';
    respostas.push('Não encontrei seu último pedido. Digite *2* para montar um novo 🛒');
  }

} else if ((texto === 'não' || texto === 'nao') && currentState === 'repeat_order') {
  newState = 'start';
  newCart = { items: [], order_type: '', address: '', complement: '', delivery_fee: 0, payment_method: '', change_for: null, split_count: 0, split_current: 0, split_payments: [], mixed_method: '', mixed_label: '', mixed_amount: 0, address_street_temp: null, browse_category: '', pending_item_id: null, pending_item_name: '' };
  respostas.push('Tudo bem! 😊 Como posso te ajudar?');
  respostas.push(mainMenu());

} else if (currentState === 'repeat_order') {
  respostas.push(yesNo('🔄 Quer repetir seu último pedido?'));

} else if (texto === 'carrinho') {
  if (newCart.items.length === 0) {
    respostas.push('🛒 Seu carrinho está vazio.\n\nDigite *2* para fazer um pedido.');
  } else {
    const { lines, total } = cartSummary(newCart.items);
    respostas.push('🛒 *Seu carrinho:*\n\n' + lines.join('\n') + '\n\n*Total: R$ ' + fmtBRL(total) + '*\n\nDigite mais itens, *finalizar* para concluir ou *0* para voltar ao menu.');
  }

} else if (texto === 'finalizar') {
  if (newCart.items.length === 0) {
    respostas.push('🛒 Seu carrinho está vazio.\n\nDigite *2* para fazer um pedido.');
  } else {
    const { lines, total } = cartSummary(newCart.items);
    const minOrder = parseFloat(config['min_order_value'] || '0');
    if (minOrder > 0 && total < minOrder) {
      respostas.push('⚠️ Valor mínimo do pedido: *R$ ' + fmtBRL(minOrder) + '*\n\nSeu carrinho: R$ ' + fmtBRL(total) + '\n\nAdicione mais itens para finalizar 🛒');
    } else {
      newState = 'confirming';
      respostas.push(confirmBtn('📋 *Resumo do pedido:*\n\n' + lines.join('\n') + '\n\n*Total: R$ ' + fmtBRL(total) + '*\n\nConfirma o pedido?'));
    }
  }
} else if ((texto === 'confirmar' || texto === 'sim') && currentState === 'confirming') {
  if (orderTypes.length > 1) {
    newState = 'awaiting_type';
    respostas.push(orderTypeBtn());
  } else if (featureDelivery) {
    newCart.order_type = 'delivery';
    newState = 'awaiting_address';
    respostas.push('📍 *Qual é o seu endereço de entrega?*\n\nEx: _Rua das Flores, 123, Centro, Cidade, SP_\nOu informe o *CEP* (ex: _14403-772_)\nOu compartilhe sua 📍 *localização* pelo WhatsApp');
  } else {
    newCart.order_type = orderTypes[0] ? orderTypes[0].name : 'retirada';
    newCart.delivery_fee = 0;
    newState = 'awaiting_payment';
    respostas.push('✅ *' + (orderTypes[0] ? orderTypes[0].label : 'Retirada') + '!*'); respostas.push(paymentList(newCart.split_count));
  }
