// ═══════════════════════════════════════════════════════════════
// MISC — Atalhos de navegação + estados auxiliares
//   5/meu pedido · 4/atendente · 6/notificações · 0/voltar
//   human_handoff · awaiting_order_detail · notifications_menu
//   awaiting_name · awaiting_complement · keyword handlers
//   awaiting_marketing_opt_in
// ═══════════════════════════════════════════════════════════════
} else if (!expectingRawInput && (texto === '5' || texto.startsWith('meu pedido') || texto.startsWith('meus pedido') || texto === 'pedidos')) {
  const statusLabel = (status, orderType) => {
    const isDelivery = orderType === 'delivery';
    const map = {
      received:          '🕐 Aguardando confirmação',
      confirmed:         '✅ Confirmado — entrando em preparo',
      preparing:         '👨‍🍳 Sendo preparado agora',
      ready:             isDelivery ? '🛵 Saiu para entrega!' : '✅ Pronto para retirar!',
      out_for_delivery:  '🛵 Em rota de entrega',
      delivered:         '📦 Entregue com sucesso',
      cancelled:         '❌ Cancelado',
    };
    return map[status] || status;
  };
  if (!recentOrders || recentOrders.length === 0) {
    respostas.push('📦 Você ainda não fez nenhum pedido.\n\nDigite *2* para fazer seu primeiro pedido! 🛒');
  } else {
    let msg = '📦 *Seus últimos pedidos:*\n\n';
    recentOrders.forEach((o, i) => {
      const st = statusLabel(o.status, o.order_type) || o.status;
      const tipo = o.order_type === 'delivery' ? '🚗 Delivery' : o.order_type === 'retirada' ? '🏃 Retirada' : '🪑 Mesa';
      msg += '*' + (i+1) + '. #' + o.code + '*\n'
           + '   ' + tipo + ' — R$ ' + fmtBRL(o.total) + '\n'
           + '   ' + st + ' — ' + o.created_at + '\n\n';
    });
    msg += '_Para detalhes de um pedido, digite o código (ex: SK-001)._';
    respostas.push(msg);
    newState = 'awaiting_order_detail';
  }

} else if (!expectingRawInput && (texto === '4' || texto.includes('atendente') || texto.includes('humano'))) {
  newState = 'human_handoff';
  create_chatwoot_conversation = true;
  chatwootCustomerName = customerName || '';
  respostas.push('👤 *Conectando com um atendente...*\n\nEm instantes alguém da nossa equipe irá te atender. Aguarde! 🌸');

} else if (!expectingRawInput && (texto === '6' || texto === 'notificacoes' || texto === 'notificações')) {
  respostas.push(notifBtn($json.marketing_opt_in));
  newState = 'notifications_menu';

} else if (!expectingRawInput && (texto === '0' || texto === 'voltar')) {
  newState = 'start';
  respostas.push('🔙 Voltando ao menu principal...\n\n'); respostas.push(mainMenu());

} else if (currentState === 'human_handoff') {
  // Keep state — a human agent is handling via Chatwoot
  respostas.push('⏳ Você está em atendimento com nossa equipe.\n\nAguarde a resposta do atendente.\n\n_Digite *sair* para reiniciar o atendimento automático._');

} else if (currentState === 'awaiting_order_detail') {
  // Match order code like SK-001 or #SK-001
  const codeInput = texto.replace(/^#/, '').toUpperCase();
  const order = recentOrders.find(o => o.code.toUpperCase() === codeInput);
  if (order) {
    const statusLabel = (status, orderType) => {
    const isDelivery = orderType === 'delivery';
    const map = {
      received:          '🕐 Aguardando confirmação',
      confirmed:         '✅ Confirmado — entrando em preparo',
      preparing:         '👨‍🍳 Sendo preparado agora',
      ready:             isDelivery ? '🛵 Saiu para entrega!' : '✅ Pronto para retirar!',
      out_for_delivery:  '🛵 Em rota de entrega',
      delivered:         '📦 Entregue com sucesso',
      cancelled:         '❌ Cancelado',
    };
    return map[status] || status;
  };
    const tipo = order.order_type === 'delivery' ? '🚗 Delivery' : order.order_type === 'retirada' ? '🏃 Retirada' : '🪑 Mesa';
    const st = statusLabel(order.status, order.order_type) || order.status;
    respostas.push(
      '📦 *Pedido #' + order.code + '*\n\n'
      + tipo + ' — R$ ' + fmtBRL(order.total) + '\n'
      + st + ' — ' + order.created_at + '\n'
      + (order.payment_method ? '💳 ' + order.payment_method + '\n' : '')
      + '\n_' + order.items_count + ' item(s)_\n\n'
      + 'Digite outro código para consultar ou *0* para voltar ao menu.'
    );
  } else if (texto === '0' || texto === 'voltar' || texto === 'menu') {
    newState = 'start';
    respostas.push('🔙 Voltando ao menu principal...\n\n'); respostas.push(mainMenu());
  } else {
    respostas.push('❌ Código *' + texto + '* não encontrado.\n\nTente novamente ou digite *0* para voltar.');
  }

} else if (currentState === 'notifications_menu') {
  if (texto === 'ativar' || texto === 'sim') {
    save_marketing_opt_in = true;
    marketing_opt_in_value = true;
    newState = 'start';
    respostas.push('🔔 *Notificações ativadas!*\n\nVocê receberá promoções e novidades. Para desativar, acesse *Notificações* no menu.\n\n'); respostas.push(mainMenu());
  } else if (texto === 'desativar' || texto === 'nao' || texto === 'não') {
    save_marketing_opt_in = true;
    marketing_opt_in_value = false;
    newState = 'start';
    respostas.push('🔕 *Notificações desativadas.*\n\nVocê não receberá mais promoções. Para reativar, acesse *Notificações* no menu.\n\n'); respostas.push(mainMenu());
  } else if (texto === '0' || texto === 'voltar') {
    newState = 'start';
    respostas.push('🔙 '); respostas.push(mainMenu());
  } else {
    respostas.push('Digite *ativar* para receber notificações, *desativar* para parar, ou *0* para voltar.');
  }

} else if (currentState === 'awaiting_name') {
  const validation = validateName(texto);
  if (!validation.valid) {
    if (validation.reason === 'bad_word') {
      respostas.push('😄 Entendo que às vezes usamos apelidos entre amigos, mas para te atendermos melhor, qual é o seu *nome verdadeiro*?');
    } else {
      respostas.push('Hmm, não consegui identificar. 😊 Pode me informar seu *nome* (pelo menos o primeiro)?');
    }
    newState = 'awaiting_name';
  } else {
    const nameFormatted = capitalizeName(texto);
    customerNameToSave = nameFormatted;
    save_customer_name = true;
    newState = 'start';
    if (lastOrder && Array.isArray(lastOrder.items) && lastOrder.items.length > 0) {
      const lines = buildRepeatOrderLines(lastOrder, products, '🔄 *Seu último pedido foi:*');
      newState = 'repeat_order';
      respostas.push('Prazer, *' + nameFormatted + '*! 😊\n\n' + msgWelcome);
      respostas.push(lines.join('\n'));
      respostas.push(yesNo('🔄 Quer repetir esse pedido?'));
    } else {
      respostas.push('Prazer, *' + nameFormatted + '*! 😊\n\n' + msgWelcome); respostas.push(mainMenu());
    }
  }

} else if (currentState === 'awaiting_complement') {
  if (texto === 'ok' || texto === 'nao' || texto === 'não' || texto === 'sem complemento') {
    newCart.complement = '';
  } else {
    newCart.complement = texto.trim();
  }
  newState = 'awaiting_payment';
  respostas.push(paymentList(newCart.split_count));

} else if (texto === 'status' || texto === 'meu pedido' || texto === 'pedido') {
  if (!lastOrder || !lastOrder.code) {
    respostas.push('Nenhum pedido encontrado. 😊\n\nDigite *2* para fazer seu primeiro pedido!');
  } else {
    const statusMap = { received: '📥 Recebido', confirmed: '✅ Confirmado', preparing: '👨‍🍳 Em preparo', ready: '✅ Pronto para entrega', delivered: '🚀 Entregue', cancelled: '❌ Cancelado' };
    const stLabel = statusMap[lastOrder.status] || lastOrder.status || '📥 Recebido';
    const { lines } = cartSummary(lastOrder.items || []);
    respostas.push('📋 *Seu último pedido:*\n\n🔖 Código: *' + lastOrder.code + '*\n\n' + lines.join('\n') + '\n\n*Total: R$ ' + fmtBRL(lastOrder.total) + '*\n\nStatus: ' + stLabel);
  }

} else if (texto === 'notificações' || texto === 'notificacoes' || texto === 'promoções' || texto === 'promocoes') {
  if (marketingOptIn === true) {
    respostas.push('📣 *Notificações:* Ativas ✅\n\nVocê recebe nossas promoções e novidades.\n\nDigite *desativar notificações* para parar de receber.');
  } else if (marketingOptIn === false) {
    respostas.push('📣 *Notificações:* Desativadas ❌\n\nVocê não está recebendo promoções.\n\nDigite *ativar notificações* para voltar a receber.');
  } else {
    respostas.push('📣 *Notificações:* Não configuradas\n\nDeseja receber promoções e novidades?\n\nDigite *ativar notificações* para receber ou *não* para não receber.');
  }

} else if (texto.includes('desativar notifica') || texto.includes('desativar promoç')) {
  save_marketing_opt_in = true;
  marketing_opt_in_value = false;
  respostas.push('✅ Notificações desativadas.\n\nNão enviaremos promoções para você.\n\nDigite *ativar notificações* a qualquer momento para reativar.');

} else if (texto.includes('ativar notifica') || texto.includes('ativar promoç')) {
  save_marketing_opt_in = true;
  marketing_opt_in_value = true;
  respostas.push('✅ Notificações ativadas! 🎉\n\nVocê receberá nossas promoções e novidades.');

} else if (currentState === 'awaiting_marketing_opt_in') {
  if (texto === 'sim') {
    save_marketing_opt_in = true;
    marketing_opt_in_value = true;
    newState = 'start';
    respostas.push('✅ Ótimo! Você receberá nossas promoções e novidades. 🎉\n\nDigite *notificações* a qualquer momento para gerenciar.');
  } else if (texto === 'não' || texto === 'nao') {
    save_marketing_opt_in = true;
    marketing_opt_in_value = false;
    newState = 'start';
    respostas.push('Tudo bem! Não enviaremos promoções. 😊\n\nDigite *ativar notificações* se mudar de ideia.');
  } else {
    respostas.push('Responda *sim* para receber promoções ou *não* para não receber:');
  }
