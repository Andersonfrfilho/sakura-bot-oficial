// ═══════════════════════════════════════════════════════════════
// FALLBACK — Parsing livre de número/texto não reconhecido
// ═══════════════════════════════════════════════════════════════
} else {
  const lines = texto.split(/[\n,+]/).map(l => l.trim()).filter(Boolean);
  const newItems = [];
  const unrecognized = [];
  for (const line of lines) {
    const mNum = line.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    if (mNum) {
      const idx = parseInt(mNum[1]) - 1;
      const qty = parseInt(mNum[2]);
      if (qty < 1) { unrecognized.push(line); continue; }
      if (idx >= 0 && products && idx < products.length) {
        const p = products[idx];
        newItems.push({ id: p.id, name: p.name, qty, price: Number(p.price), menuIdx: idx + 1 });
      } else { unrecognized.push(line); }
      continue;
    }
    const mName = line.match(/^(.+?)\s*[xX×]\s*(\d+)$/);
    if (mName) {
      const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const search = norm(mName[1].trim());
      const qty = parseInt(mName[2]);
      const p = products && products.find(p => norm(p.name).includes(search));
      if (p && qty >= 1) { newItems.push({ id: p.id, name: p.name, qty, price: Number(p.price), menuIdx: products.indexOf(p) + 1 }); }
      else { unrecognized.push(line); }
      continue;
    }
    const numOnly = line.match(/^(\d+)$/);
    if (numOnly) {
      const num = parseInt(numOnly[1]);
      if (num >= 1 && products && num <= products.length) {
        const p = products[num - 1];
        newItems.push({ id: p.id, name: p.name, qty: 1, price: Number(p.price), menuIdx: num });
      } else { unrecognized.push(line); }
    } else { unrecognized.push(line); }
  }

  if (newItems.length > 0) {
    // Desduplicar: mesmo produto pedido várias vezes na mesma mensagem
    const dedupedItems = [];
    for (const item of newItems) {
      const ex = dedupedItems.find(i => i.id === item.id);
      if (ex) { ex.qty += item.qty; } else { dedupedItems.push({ ...item }); }
    }
    // Mergear com carrinho existente
    const hadItemsBefore = newCart.items.length > 0;
    for (const item of dedupedItems) {
      const ex = newCart.items.find(i => i.id === item.id);
      if (ex) { ex.qty += item.qty; } else { newCart.items.push(item); }
    }
    newState = 'ordering';
    const added = dedupedItems.map(i => '• [' + (i.menuIdx || '') + '] ' + i.name + ' — R$ ' + fmtBRL(i.price) + ' × ' + i.qty + ' — R$ ' + fmtBRL(i.price * i.qty)).join('\n');
    const { lines: cartLines, total } = cartSummary(newCart.items);
    let msg = '✅ *Adicionado:*\n' + added;
    if (hadItemsBefore) {
      msg += '\n\n🛒 *Carrinho:*\n' + cartLines.join('\n') + '\n*Total: R$ ' + fmtBRL(total) + '*';
    } else {
      msg += '\n\n*Total parcial: R$ ' + fmtBRL(total) + '*';
    }
    if (unrecognized.length > 0) msg += '\n\n⚠️ Não reconhecido: ' + unrecognized.join(', ');
    msg += '\n\nDigite mais itens, *carrinho* para ver o resumo, *finalizar* para concluir ou *0* para voltar.';
    respostas.push(msg);
  } else if (currentState === 'start') {
    respostas.push(msgWelcome); respostas.push(mainMenu());
  } else {
    respostas.push('Não entendi 😅\n\nDigite *menu* para ver as opções ou *2* para fazer um pedido.');
  }
}
