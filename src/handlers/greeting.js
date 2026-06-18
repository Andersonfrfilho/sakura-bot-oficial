// ═══════════════════════════════════════════════════════════════
// GREETING — Saudação e entrada no fluxo
// ═══════════════════════════════════════════════════════════════
} else if (greetings.includes(texto) || texto.includes('oi!') || texto.includes('ola!')) {
  newState = 'start';
  newCart = { items: [], order_type: '', address: '', complement: '', delivery_fee: 0, payment_method: '', change_for: null, split_count: 0, split_current: 0, split_payments: [], mixed_method: '', mixed_label: '', mixed_amount: 0, address_street_temp: null, browse_category: '', browse_page: 0, pending_item_id: null, pending_item_name: '' };

  if (!customerName) {
    newState = 'awaiting_name';
    const estName = config['establishment_name'] || 'nosso estabelecimento';
    respostas.push('Olá! 👋 Seja bem-vindo(a) ao *' + estName + '*!\n\nPara te atendermos melhor, qual é o seu *nome*?');
  } else {
    if (!customerNameFromDB && pushNameFormatted) {
      customerNameToSave = pushNameFormatted;
      save_customer_name = true;
    }
    if (lastOrder && Array.isArray(lastOrder.items) && lastOrder.items.length > 0) {
      const lines = buildRepeatOrderLines(lastOrder, products, '🔄 Que saudade, *' + customerName + '*! Seu último pedido foi:');
      newState = 'repeat_order';
      respostas.push(msgWelcome);
      respostas.push(lines.join('\n'));
      respostas.push(yesNo('🔄 Quer repetir esse pedido?'));
    } else {
      respostas.push(msgWelcome); respostas.push(mainMenu());
    }
  }
