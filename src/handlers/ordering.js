// ═══════════════════════════════════════════════════════════════
// ORDERING — Navegação e seleção de itens  ← PRIORIDADE MÁXIMA
//   browsing/ordering_cat · browsing/ordering_items
//   awaiting_qty · awaiting_more
// ═══════════════════════════════════════════════════════════════
} else if (currentState === 'browsing_categories' || currentState === 'ordering_cat') {
  const isOrder = true;
  const catInput = texto.replace(/^(order_cat:|cat:)/, '');
  if (catInput === 'back' || texto === '0' || texto === 'voltar') {
    newState = 'start'; respostas.push(mainMenu());
  } else {
    const cats = [...new Set(products.map(p => p.category || 'Outros'))];
    const found = cats.find(c => c.toLowerCase() === catInput.toLowerCase());
    if (found) {
      newCart.browse_category = found;
      newState = isOrder ? 'ordering_items' : 'browsing_items';
      respostas.push(itemsList(found, isOrder ? 'order' : 'view', 0));
    } else {
      respostas.push(categoryList(isOrder ? 'order' : 'view'));
    }
  }

} else if (currentState === 'browsing_items' || currentState === 'ordering_items') {
  const isOrder = true;
  const cat = newCart.browse_category || '';
  if (texto === 'cat:back' || texto === 'order_cat:back' || texto === '0' || texto === 'voltar') {
    newState = isOrder ? 'ordering_cat' : 'browsing_categories';
    respostas.push(categoryList(isOrder ? 'order' : 'view'));
  } else if (texto.startsWith('page:')) {
    const parts = texto.split(':'); const pageCtx = parts[1]; const pageCatRaw = parts.slice(2, -1).join(':'); const pageNum = parseInt(parts[parts.length - 1]);
    const pageCat = products.map(p => p.category||'Outros').find(c => c.toLowerCase() === pageCatRaw.toLowerCase()) || pageCatRaw;
    respostas.push(itemsList(pageCat, pageCtx, pageNum));
  } else {
    // Number selection from text menu
    const num = parseInt(texto);
    const allCatItems = products.filter(p => (p.category || 'Outros') === cat);
    const PAGE_SIZE = 9;
    const currentPage = newCart.browse_page || 0;
    const start = currentPage * PAGE_SIZE;
    if (texto === 'próxima' || texto === 'proxima' || texto === 'próximo' || texto === 'proximo') {
      if (allCatItems.length > start + PAGE_SIZE) {
        newCart.browse_page = currentPage + 1;
        respostas.push(itemsList(cat, isOrder ? 'order' : 'view', currentPage + 1));
      } else {
        respostas.push(itemsList(cat, isOrder ? 'order' : 'view', 0));
      }
    } else if (!isNaN(num) && num >= 1 && num <= allCatItems.length) {
      const product = allCatItems[num - 1];
      newCart.pending_item_id = product.id; newCart.pending_item_name = product.name;
      newCart.browse_page = 0;
      newState = 'awaiting_qty';
      const desc = product.description ? '\n_' + product.description + '_' : '';
      respostas.push({ type: 'buttons', body: '🛒 *' + product.name + '*\nR$ ' + fmtBRL(product.price) + desc, buttons: [{ id: 'qty:1', title: '✅ Adicionar (1un)' }, { id: 'qty:more', title: '✏️ Outra qtd' }, { id: 'item:back', title: '↩️ Voltar' }] });
    } else {
      respostas.push(itemsList(cat, isOrder ? 'order' : 'view', currentPage));
    }
  }

} else if (currentState === 'awaiting_qty') {
  if (texto === 'item:back') {
    newState = 'ordering_items';
    respostas.push(itemsList(newCart.browse_category || '', 'order', newCart.browse_page || 0));
  } else if (texto === 'qty:more') {
    respostas.push('✏️ *Quantas unidades?* Digite o número:');
  } else {
    let qty = null;
    if (texto.startsWith('qty:')) { qty = parseInt(texto.replace('qty:', '')); }
    else { const n = parseInt(texto); if (!isNaN(n) && n >= 1 && n <= 99) qty = n; }
    if (!qty || qty < 1) {
      respostas.push({ type: 'buttons', body: '✏️ *Quantas unidades?*\nDigite um número ou escolha:', buttons: [{ id: 'qty:1', title: '✅ Adicionar (1un)' }, { id: 'item:back', title: '↩️ Voltar' }] });
    } else {
      const product = products.find(p => String(p.id) === String(newCart.pending_item_id));
      if (product) {
        const existing = newCart.items.find(i => i.id === product.id);
        if (existing) { existing.qty += qty; } else { newCart.items.push({ id: product.id, name: product.name, qty, price: Number(product.price), menuIdx: products.indexOf(product) + 1 }); }
        newCart.pending_item_id = null; newCart.pending_item_name = '';
        const { total } = cartSummary(newCart.items);
        newState = 'awaiting_more';
        respostas.push({ type: 'buttons', body: '✅ *' + product.name + '* × ' + qty + ' adicionado!\n\n🛒 Total parcial: R$ ' + fmtBRL(total) + '\n\nDeseja adicionar mais itens ou finalizar?', buttons: [{ id: '__add_more__', title: '➕ Adicionar mais' }, { id: 'finalizar', title: '✅ Finalizar' }] });
      } else { newState = 'start'; respostas.push(mainMenu()); }
    }
  }

} else if (currentState === 'awaiting_more') {
  if (texto === '__add_more__') {
    const cat = newCart.browse_category;
    newState = cat ? 'ordering_items' : 'ordering_cat';
    respostas.push(cat ? itemsList(cat, 'order', 0) : categoryList('order'));
  } else if (texto === 'finalizar') {
    const { lines, total } = cartSummary(newCart.items);
    const minOrder = parseFloat(config['min_order_value'] || '0');
    if (minOrder > 0 && total < minOrder) {
      respostas.push('⚠️ Valor mínimo: *R$ ' + fmtBRL(minOrder) + '*\n\nTotal atual: R$ ' + fmtBRL(total));
      newState = 'awaiting_more';
      respostas.push({ type: 'buttons', body: 'Adicionar mais para atingir o mínimo?', buttons: [{ id: '__add_more__', title: '➕ Adicionar mais' }] });
    } else {
      newState = 'confirming';
      respostas.push(confirmBtn('📋 *Resumo do pedido:*\n\n' + lines.join('\n') + '\n\n*Total: R$ ' + fmtBRL(total) + '*\n\nConfirma o pedido?'));
    }
  } else {
    respostas.push({ type: 'buttons', body: 'Deseja adicionar mais itens?', buttons: [{ id: '__add_more__', title: '➕ Adicionar mais' }, { id: 'finalizar', title: '✅ Finalizar' }] });
  }
