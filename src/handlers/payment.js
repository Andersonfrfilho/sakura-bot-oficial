// ═══════════════════════════════════════════════════════════════
// PAYMENT — Fluxo de pagamento
//   awaiting_payment · change · split · mixed
// ═══════════════════════════════════════════════════════════════
} else if (currentState === 'awaiting_mixed_method') {
  const nonCash = paymentTypes.filter(t => t.name !== 'dinheiro');
  const choice = parseInt(texto) - 1;
  if (choice >= 0 && choice < nonCash.length) {
    newCart.mixed_method = nonCash[choice].name;
    newCart.mixed_label  = nonCash[choice].label;
    const { total: st } = cartSummary(newCart.items);
    const total = st + newCart.delivery_fee;
    newState = 'awaiting_mixed_amount';
    respostas.push('💰 *Pagamento misto*\n\nTotal: *R$ ' + fmtBRL(total) + '*\n\nQual valor em *' + nonCash[choice].label + '*?\n(O restante será em dinheiro)\n\nEx: _30_');
  } else {
    respostas.push('Opção inválida.\n\n' + nonCashOptions() + '\n\nDigite o número.');
  }

} else if (currentState === 'awaiting_mixed_amount') {
  const entered = parseFloat(texto.replace(',', '.'));
  const { lines, total: subtotal } = cartSummary(newCart.items);
  const total = subtotal + newCart.delivery_fee;
  if (isNaN(entered) || entered <= 0) {
    respostas.push('⚠️ Valor inválido. Informe o valor em *' + (newCart.mixed_label || 'cartão') + '*:\n\nEx: _30_');
  } else if (entered >= total) {
    respostas.push('⚠️ O valor em ' + (newCart.mixed_label || 'cartão') + ' (R$ ' + fmtBRL(entered) + ') é maior ou igual ao total (R$ ' + fmtBRL(total) + ').\n\nInforme um valor menor:');
  } else {
    const cashPart = total - entered;
    newCart.mixed_amount = entered;
    const cashPart2 = total - entered;
    newState = 'awaiting_mixed_change';
    respostas.push('💵 *Parte em dinheiro: R$ ' + fmtBRL(cashPart2) + '*\n\nVai precisar de troco? Se sim, informe o valor da nota (ex: _500_) ou o troco desejado (ex: _34,50 troco_). Se não, digite *não*.');
  }

} else if (currentState === 'awaiting_split_count') {
  const n = parseInt(texto);
  if (!n || n < 2 || n > 30) {
    respostas.push('⚠️ Informe um número válido de pessoas (2 a 30):\n\nEx: _4_');
  } else {
    newCart.split_count = n;
    newCart.split_current = 1;
    newCart.split_payments = [];
    const { total: st } = cartSummary(newCart.items);
    const total = st + newCart.delivery_fee;
    const perPerson = fmtBRL(total / n);
    newState = 'awaiting_split_payment';
    const payOpts = paymentTypes.map((t, i) => (i+1) + '. ' + t.label).join('\n');
    respostas.push('👥 *' + n + ' pessoas — R$ ' + perPerson + '/pessoa*\n\n*Pessoa 1 de ' + n + ':*\nComo vai pagar?\n\n' + payOpts + '\n\nDigite o número.');
  }

} else if (currentState === 'awaiting_split_payment') {
  const choice = parseInt(texto) - 1;
  const payOpts = paymentTypes.map((t, i) => (i+1) + '. ' + t.label).join('\n');
  if (choice < 0 || choice >= paymentTypes.length) {
    respostas.push('Opção inválida. Como vai pagar?\n\n' + payOpts + '\n\nDigite o número.');
  } else {
    const payment = paymentTypes[choice];
    const { total: st } = cartSummary(newCart.items);
    const total = st + newCart.delivery_fee;
    const n = newCart.split_count;
    const perPerson = total / n;

    if (payment.name === 'dinheiro') {
      newCart.payment_method = 'dinheiro';
      newState = 'awaiting_split_change';
      respostas.push('💵 *Dinheiro — Pessoa ' + newCart.split_current + '*\n\nValor: *R$ ' + fmtBRL(perPerson) + '*\n\nVai precisar de troco? Se sim, informe o valor da nota (ex: _500_) ou o troco desejado (ex: _34,50 troco_). Se não, digite *não*.');
    } else {
      const payments = Array.isArray(newCart.split_payments) ? newCart.split_payments : [];
      payments.push({ person: newCart.split_current, label: payment.label, change_for: null });
      newCart.split_payments = payments;

      if (newCart.split_current >= n) {
        const { lines, total: subtotal } = cartSummary(newCart.items);
        const addrFull = newCart.address + (newCart.complement ? ', ' + newCart.complement : '');
        const mapsLine = newCart.order_type === 'delivery' ? '\n🗺️ https://maps.google.com/?q=' + encodeURIComponent(addrFull) : '';
        const typeLabel = newCart.order_type === 'delivery' ? '🚀 *Entregar*\n📍 ' + addrFull + mapsLine : '📤 *' + (orderTypes.find(t => t.name === newCart.order_type) || {label:'Retirada no local 📤'}).label + '*';
        const feeLine = newCart.delivery_fee > 0 ? '\n🛵 Entrega: R$ ' + fmtBRL(newCart.delivery_fee) : '\n🎉 Frete grátis!';
        const splitDetail = payments.map(p => '• Pessoa ' + p.person + ': ' + p.label + (p.change_for ? ' _(troco p/ R$ ' + fmtBRL(p.change_for) + ')_' : '')).join('\n');
        const orderCode = generateOrderCode(tel);
        respostas.push('✅ *Pedido confirmado!*\n\n' + lines.join('\n') + '\n\n*Subtotal: R$ ' + fmtBRL(subtotal) + '*' + feeLine + '\n*Total: R$ ' + fmtBRL(total) + '*\n\n' + typeLabel + '\n\n👥 *Divisão — ' + n + ' pessoas (R$ ' + fmtBRL(perPerson) + '/pessoa):*\n' + splitDetail + '\n\n🔖 *Código do pedido: ' + orderCode + '*\n\nSeu pedido foi recebido e logo estará sendo preparado! 🎉');
        save_order = true;
        finalOrder = { tel, customer_name: customerName, code: orderCode, items: newCart.items, subtotal, delivery_fee: newCart.delivery_fee, total, order_type: newCart.order_type, address: newCart.order_type === 'delivery' ? addrFull : '', maps_link: newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(addrFull)) : '', payment_method: 'dividido: ' + payments.map(p => p.label).join(', '), change_for: null, split_count: n, split_payments: payments };
        newState = 'start';
        newCart = { items: [], order_type: '', address: '', complement: '', delivery_fee: 0, payment_method: '', change_for: null, split_count: 0, split_current: 0, split_payments: [], mixed_method: '', mixed_label: '', mixed_amount: 0, address_street_temp: null, browse_category: '', pending_item_id: null, pending_item_name: '' };
        maybeAskOptIn();
      } else {
        newCart.split_current = newCart.split_current + 1;
        newState = 'awaiting_split_payment';
        respostas.push('*Pessoa ' + newCart.split_current + ' de ' + n + ':* Como vai pagar?\n\n' + payOpts + '\n\nDigite o número.');
      }
    }
  }

} else if (currentState === 'awaiting_split_change') {
  const { total: st } = cartSummary(newCart.items);
  const total = st + newCart.delivery_fee;
  const n = newCart.split_count;
  const perPerson = total / n;
  const payOpts = paymentTypes.map((t, i) => (i+1) + '. ' + t.label).join('\n');

  let changeFor = null;
  if (texto !== 'não' && texto !== 'nao') {
    const val = parseTrocoInput(texto, perPerson);
    if (val === null || val <= perPerson) {
      respostas.push('⚠️ O valor deve ser maior que R$ ' + fmtBRL(perPerson) + '.\n\nInforme o valor da nota (ex: _500_) ou o troco desejado (ex: _34,50 troco_) ou *não* para sem troco:');
      newState = 'awaiting_split_change';
      return [{ json: { tel, instancia, respostas, state: newState, cart: newCart, reservation_temp: newReservationTemp, save_order, order: finalOrder, save_reservation, reservation: finalReservation, save_customer_name, customer_name_to_save: customerNameToSave, save_marketing_opt_in, marketing_opt_in_value, kitchen_phone: config['kitchen_phone'] || '', create_chatwoot_conversation, chatwoot_customer_name: chatwootCustomerName } }];
    }
    changeFor = val;
  }

  const payments = Array.isArray(newCart.split_payments) ? newCart.split_payments : [];
  payments.push({ person: newCart.split_current, label: '💵 Dinheiro', change_for: changeFor });
  newCart.split_payments = payments;

  if (newCart.split_current >= n) {
    const { lines, total: subtotal } = cartSummary(newCart.items);
    const addrFull = newCart.address + (newCart.complement ? ', ' + newCart.complement : '');
    const mapsLine = newCart.order_type === 'delivery' ? '\n🗺️ https://maps.google.com/?q=' + encodeURIComponent(addrFull) : '';
    const typeLabel = newCart.order_type === 'delivery' ? '🚀 *Entregar*\n📍 ' + addrFull + mapsLine : '📤 *' + (orderTypes.find(t => t.name === newCart.order_type) || {label:'Retirada no local 📤'}).label + '*';
    const feeLine = newCart.delivery_fee > 0 ? '\n🛵 Entrega: R$ ' + fmtBRL(newCart.delivery_fee) : '\n🎉 Frete grátis!';
    const splitDetail = payments.map(p => '• Pessoa ' + p.person + ': ' + p.label + (p.change_for ? ' _(troco p/ R$ ' + fmtBRL(p.change_for) + ')_' : '')).join('\n');
    const orderCode = generateOrderCode(tel);
    respostas.push('✅ *Pedido confirmado!*\n\n' + lines.join('\n') + '\n\n*Subtotal: R$ ' + fmtBRL(subtotal) + '*' + feeLine + '\n*Total: R$ ' + fmtBRL(total) + '*\n\n' + typeLabel + '\n\n👥 *Divisão — ' + n + ' pessoas (R$ ' + fmtBRL(perPerson) + '/pessoa):*\n' + splitDetail + '\n\n🔖 *Código do pedido: ' + orderCode + '*\n\nSeu pedido foi recebido e logo estará sendo preparado! 🎉');
    save_order = true;
    finalOrder = { tel, customer_name: customerName, code: orderCode, items: newCart.items, subtotal, delivery_fee: newCart.delivery_fee, total, order_type: newCart.order_type, address: newCart.order_type === 'delivery' ? addrFull : '', maps_link: newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(addrFull)) : '', payment_method: 'dividido: ' + payments.map(p => p.label).join(', '), change_for: null, split_count: n, split_payments: payments };
    newState = 'start';
    newCart = { items: [], order_type: '', address: '', complement: '', delivery_fee: 0, payment_method: '', change_for: null, split_count: 0, split_current: 0, split_payments: [], mixed_method: '', mixed_label: '', mixed_amount: 0, address_street_temp: null, browse_category: '', pending_item_id: null, pending_item_name: '' };
    maybeAskOptIn();
  } else {
    newCart.split_current = newCart.split_current + 1;
    newState = 'awaiting_split_payment';
    respostas.push('*Pessoa ' + newCart.split_current + ' de ' + n + ':* Como vai pagar?\n\n' + payOpts + '\n\nDigite o número.');
  }

} else if (currentState === 'awaiting_mixed_change') {
  const { lines, total: subtotal } = cartSummary(newCart.items);
  const total = subtotal + newCart.delivery_fee;
  const entered = newCart.mixed_amount;
  const cashPart = total - entered;
  let changeFor = null;
  if (texto !== 'não' && texto !== 'nao') {
    const val = parseTrocoInput(texto, cashPart);
    if (val === null || val <= cashPart) {
      respostas.push('⚠️ O valor deve ser maior que R$ ' + fmtBRL(cashPart) + '.\n\nInforme o valor da nota (ex: _500_) ou o troco desejado (ex: _34,50 troco_) ou *não* para sem troco:');
      return [{ json: { tel, instancia, respostas, state: newState, cart: newCart, reservation_temp: newReservationTemp, save_order: false, order: null, save_reservation: false, reservation: null, save_customer_name: false, customer_name_to_save: null, save_marketing_opt_in: false, marketing_opt_in_value: null, kitchen_phone: config['kitchen_phone'] || '', create_chatwoot_conversation: false, chatwoot_customer_name: chatwootCustomerName } }];
    }
    changeFor = val;
  }
  const addrFull = newCart.address + (newCart.complement ? ', ' + newCart.complement : '');
  const mapsLine = newCart.order_type === 'delivery' ? '\n🗺️ https://maps.google.com/?q=' + encodeURIComponent(addrFull) : '';
  const typeLabel = newCart.order_type === 'delivery' ? '🚀 *Entregar*\n📍 ' + addrFull + mapsLine : '🏃 *' + (orderTypes.find(t => t.name === newCart.order_type) || {label: 'Retirada'}).label + '*';
  const feeLine = newCart.delivery_fee > 0 ? '\n🛵 Entrega: R$ ' + fmtBRL(newCart.delivery_fee) : '\n🎉 Frete grátis!';
  const changeInfo = changeFor ? ' _(troco p/ R$ ' + fmtBRL(changeFor) + ')_' : '';
  const orderCode = generateOrderCode(tel);
  respostas.push('✅ *Pedido confirmado!*\n\n' + lines.join('\n') + '\n\n*Subtotal: R$ ' + fmtBRL(subtotal) + '*' + feeLine + '\n*Total: R$ ' + fmtBRL(total) + '*\n\n' + typeLabel + '\n💳 ' + (newCart.mixed_label || 'Cartão') + ': R$ ' + fmtBRL(entered) + '\n💵 Dinheiro: R$ ' + fmtBRL(cashPart) + changeInfo + '\n\n🔖 *Código do pedido: ' + orderCode + '*\n\nSeu pedido foi recebido e logo estará sendo preparado! 🎉');
  save_order = true;
  finalOrder = { tel, customer_name: customerName, code: orderCode, items: newCart.items, subtotal, delivery_fee: newCart.delivery_fee, total, order_type: newCart.order_type, address: newCart.order_type === 'delivery' ? addrFull : '', maps_link: newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(addrFull)) : '', payment_method: (newCart.mixed_label || 'misto') + ' + dinheiro', change_for: changeFor };
  newState = 'start';
  newCart = { items: [], order_type: '', address: '', complement: '', delivery_fee: 0, payment_method: '', change_for: null, split_count: 0, split_current: 0, split_payments: [], mixed_method: '', mixed_label: '', mixed_amount: 0, address_street_temp: null, browse_category: '', pending_item_id: null, pending_item_name: '' };
  maybeAskOptIn();

} else if (currentState === 'awaiting_payment') {
  let choice = parseInt(texto) - 1;
  if (isNaN(choice) || choice < 0) choice = paymentTypes.findIndex(t => t.name === texto);
  if (choice >= 0 && choice < paymentTypes.length) {
    const payment = paymentTypes[choice];
    newCart.payment_method = payment.name;
    const { lines, total: subtotal } = cartSummary(newCart.items);
    const total = subtotal + newCart.delivery_fee;
    if (payment.name === 'dinheiro') {
      newState = 'awaiting_change';
      respostas.push('💵 *Pagamento em dinheiro!*\n\nTotal a pagar: *R$ ' + fmtBRL(total) + '*\n\nVai precisar de troco? Se sim, informe o valor da nota (ex: _500_) ou o troco desejado (ex: _34,50 troco_). Se não, digite *não*.');
    } else {
      newCart.change_for = null;
      const addrFull = newCart.address + (newCart.complement ? ', ' + newCart.complement : '');
      const mapsLine = newCart.order_type === 'delivery' ? '\n🗺️ https://maps.google.com/?q=' + encodeURIComponent(addrFull) : '';
      const typeLabel = newCart.order_type === 'delivery' ? '🚀 *Entregar*\n📍 ' + addrFull + mapsLine : '🏃 *' + (orderTypes.find(t => t.name === newCart.order_type) || {label: 'Retirada'}).label + '*';
      const pixInfo = (payment.name === 'pix' && pixKey) ? '\n\n💳 *Chave PIX:* ' + pixKey + (pixName ? '\n👤 ' + pixName : '') : '';
      const feeLine = newCart.delivery_fee > 0 ? '\n🛵 Entrega: R$ ' + fmtBRL(newCart.delivery_fee) : '\n🎉 Frete grátis!';
      const splitLine = (newCart.split_count > 1) ? '\n👥 ' + newCart.split_count + ' pessoas — *R$ ' + fmtBRL(total / newCart.split_count) + ' por pessoa*' : '';
      const orderCode = generateOrderCode(tel);
      respostas.push('✅ *Pedido confirmado!*\n\n' + lines.join('\n') + '\n\n*Subtotal: R$ ' + fmtBRL(subtotal) + '*' + feeLine + '\n*Total: R$ ' + fmtBRL(total) + '*' + splitLine + '\n\n' + typeLabel + '\n💳 Pagamento: ' + payment.label + pixInfo + '\n\n🔖 *Código do pedido: ' + orderCode + '*\n\nSeu pedido foi recebido e logo estará sendo preparado! 🎉');
      save_order = true;
      finalOrder = { tel, customer_name: customerName, code: orderCode, items: newCart.items, subtotal, delivery_fee: newCart.delivery_fee, total, order_type: newCart.order_type, address: newCart.order_type === 'delivery' ? (newCart.address + (newCart.complement ? ', ' + newCart.complement : '')) : '', maps_link: newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(newCart.address + (newCart.complement ? ', ' + newCart.complement : ''))) : '', payment_method: payment.name, change_for: null };
      newState = 'start';
      newCart = { items: [], order_type: '', address: '', complement: '', delivery_fee: 0, payment_method: '', change_for: null, split_count: 0, split_current: 0, split_payments: [], mixed_method: '', mixed_label: '', mixed_amount: 0, address_street_temp: null, browse_category: '', pending_item_id: null, pending_item_name: '' };
      maybeAskOptIn();
    }
  } else if (texto === 'dividir' || parseInt(texto) === paymentTypes.length + 1 || texto.toLowerCase().includes('dividir')) {
    newState = 'awaiting_split_count';
    respostas.push('👥 *Dividir a conta*\n\nQuantas pessoas vão dividir?\n\nEx: _4_');
  } else if (texto === 'misto' || parseInt(texto) === paymentTypes.length + 2 || texto.toLowerCase().includes('misto')) {
    const nonCash = paymentTypes.filter(t => t.name !== 'dinheiro');
    if (nonCash.length === 0) {
      respostas.push('⚠️ Não há formas de pagamento além do dinheiro cadastradas.');
    } else if (nonCash.length === 1) {
      newCart.mixed_method = nonCash[0].name;
      newCart.mixed_label  = nonCash[0].label;
      const { total: st } = cartSummary(newCart.items);
      const total = st + newCart.delivery_fee;
      newState = 'awaiting_mixed_amount';
      respostas.push('💰 *Pagamento misto*\n\nTotal: *R$ ' + fmtBRL(total) + '*\n\nQual valor em *' + nonCash[0].label + '*?\n(O restante será em dinheiro)\n\nEx: _30_');
    } else {
      newState = 'awaiting_mixed_method';
      respostas.push('💰 *Pagamento misto*\n\nEscolha a forma além do dinheiro:\n\n' + nonCashOptions() + '\n\nDigite o número.');
    }
  } else {
    respostas.push(paymentList(newCart.split_count));
  }

} else if (currentState === 'awaiting_change') {
  const { lines, total: subtotal } = cartSummary(newCart.items);
  const total = subtotal + newCart.delivery_fee;
  let changeVal = null;
  if (texto !== 'não' && texto !== 'nao') {
    changeVal = parseTrocoInput(texto, total);
    if (changeVal === null || changeVal <= total) {
      respostas.push('⚠️ Informe um valor maior que R$ ' + fmtBRL(total) + ' ou digite *não* se não precisar de troco.');
      return [{ json: { tel, instancia, respostas, state: newState, cart: newCart, reservation_temp: newReservationTemp, save_order: false, order: null, save_reservation: false, reservation: null, save_customer_name: false, customer_name_to_save: null, save_marketing_opt_in: false, marketing_opt_in_value: null, kitchen_phone: config['kitchen_phone'] || '', create_chatwoot_conversation: false, chatwoot_customer_name: chatwootCustomerName } }];
    }
  }
  newCart.change_for = changeVal;
  const addrFull = newCart.address + (newCart.complement ? ', ' + newCart.complement : '');
  const mapsLine = newCart.order_type === 'delivery' ? '\n🗺️ https://maps.google.com/?q=' + encodeURIComponent(addrFull) : '';
  const typeLabel = newCart.order_type === 'delivery' ? '🚀 *Entregar*\n📍 ' + addrFull + mapsLine : '🏃 *' + (orderTypes.find(t => t.name === newCart.order_type) || {label: 'Retirada'}).label + '*';
  const changeLine = changeVal ? '\n💵 Troco para: R$ ' + fmtBRL(changeVal) : '';
  const feeLine = newCart.delivery_fee > 0 ? '\n🛵 Entrega: R$ ' + fmtBRL(newCart.delivery_fee) : '\n🎉 Frete grátis!';
  const splitLine2 = (newCart.split_count > 1) ? '\n👥 ' + newCart.split_count + ' pessoas — *R$ ' + fmtBRL(total / newCart.split_count) + ' por pessoa*' : '';
  const orderCode = generateOrderCode(tel);
  respostas.push('✅ *Pedido confirmado!*\n\n' + lines.join('\n') + '\n\n*Subtotal: R$ ' + fmtBRL(subtotal) + '*' + feeLine + '\n*Total: R$ ' + fmtBRL(total) + '*' + splitLine2 + '\n\n' + typeLabel + '\n💵 Pagamento: Dinheiro' + changeLine + '\n\n🔖 *Código do pedido: ' + orderCode + '*\n\nSeu pedido foi recebido e logo estará sendo preparado! 🎉');
  save_order = true;
  finalOrder = { tel, customer_name: customerName, code: orderCode, items: newCart.items, subtotal, delivery_fee: newCart.delivery_fee, total, order_type: newCart.order_type, address: newCart.order_type === 'delivery' ? (newCart.address + (newCart.complement ? ', ' + newCart.complement : '')) : '', maps_link: newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(newCart.address + (newCart.complement ? ', ' + newCart.complement : ''))) : '', payment_method: 'dinheiro', change_for: changeVal };
  newState = 'start';
  newCart = { items: [], order_type: '', address: '', complement: '', delivery_fee: 0, payment_method: '', change_for: null, split_count: 0, split_current: 0, split_payments: [], mixed_method: '', mixed_label: '', mixed_amount: 0, address_street_temp: null, browse_category: '', pending_item_id: null, pending_item_name: '' };
  maybeAskOptIn();
