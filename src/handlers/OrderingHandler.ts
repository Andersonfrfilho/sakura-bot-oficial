class OrderingHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (currentState === BotState.BROWSING_CATEGORIES || currentState === BotState.ORDERING_CAT) {
      return this._handleCategories();
    }
    if (currentState === BotState.BROWSING_ITEMS || currentState === BotState.ORDERING_ITEMS) {
      return this._handleItems();
    }
    if (currentState === BotState.AWAITING_QTY) {
      return this._handleQuantity();
    }
    if (currentState === BotState.AWAITING_MORE) {
      return this._handleMore();
    }
    return false;
  }

  private _handleCategories(): boolean {
    const catInput = texto.replace(/^(order_cat:|cat:)/, '');
    if (catInput === 'back' || texto === '0' || texto === 'voltar') {
      newState = BotState.START;
      respostas.push(mainMenu());
      return true;
    }

    const allCategories = [...new Set(products.map((product: Product) => product.category || 'Outros'))] as string[];
    const foundCategory = allCategories.find((category: string) => category.toLowerCase() === catInput.toLowerCase());

    if (foundCategory) {
      newCart.browse_category = foundCategory;
      newState = BotState.ORDERING_ITEMS;
      respostas.push(itemsList(foundCategory, 'order', 0));
    } else {
      respostas.push(categoryList('order'));
    }
    return true;
  }

  private _handleItems(): boolean {
    const currentCategory = newCart.browse_category || '';

    if (texto === 'cat:back' || texto === 'order_cat:back' || texto === '0' || texto === 'voltar') {
      newState = BotState.ORDERING_CAT;
      respostas.push(categoryList('order'));
      return true;
    }

    if (texto.startsWith('page:')) {
      const pageParts = texto.split(':');
      const pageContext = pageParts[1];
      const pageCategoryRaw = pageParts.slice(2, -1).join(':');
      const pageNumber = parseInt(pageParts[pageParts.length - 1]);
      const resolvedCategory = products.map((product: Product) => product.category || 'Outros')
        .find((category: string) => category.toLowerCase() === pageCategoryRaw.toLowerCase()) || pageCategoryRaw;
      respostas.push(itemsList(resolvedCategory, pageContext, pageNumber));
      return true;
    }

    const allCategoryItems = products.filter((product: Product) => (product.category || 'Outros') === currentCategory);
    const PAGE_SIZE = 9;
    const currentPage = newCart.browse_page || 0;
    const pageStart = currentPage * PAGE_SIZE;

    if (texto === 'próxima' || texto === 'proxima' || texto === 'próximo' || texto === 'proximo') {
      if (allCategoryItems.length > pageStart + PAGE_SIZE) {
        newCart.browse_page = currentPage + 1;
        respostas.push(itemsList(currentCategory, 'order', currentPage + 1));
      } else {
        respostas.push(itemsList(currentCategory, 'order', 0));
      }
      return true;
    }

    const itemNumber = parseInt(texto);
    if (!isNaN(itemNumber) && itemNumber >= 1 && itemNumber <= allCategoryItems.length) {
      const selectedProduct = allCategoryItems[itemNumber - 1];
      newCart.pending_item_id = selectedProduct.id;
      newCart.pending_item_name = selectedProduct.name;
      newCart.browse_page = 0;
      newState = BotState.AWAITING_QTY;
      const descriptionText = selectedProduct.description ? '\n_' + selectedProduct.description + '_' : '';
      respostas.push({
        type: 'buttons',
        body: '🛒 *' + selectedProduct.name + '*\nR$ ' + fmtBRL(selectedProduct.price) + descriptionText,
        buttons: [
          { id: 'qty:1', title: '✅ Adicionar (1un)' },
          { id: 'qty:more', title: '✏️ Outra qtd' },
          { id: 'item:back', title: '↩️ Voltar' },
        ],
      });
    } else {
      respostas.push(itemsList(currentCategory, 'order', currentPage));
    }
    return true;
  }

  private _handleQuantity(): boolean {
    if (texto === 'item:back') {
      newState = BotState.ORDERING_ITEMS;
      respostas.push(itemsList(newCart.browse_category || '', 'order', newCart.browse_page || 0));
      return true;
    }

    if (texto === 'qty:more') {
      respostas.push(MessagesConstants.QTD_SOLICITAR);
      return true;
    }

    let quantity: number | null = null;
    if (texto.startsWith('qty:')) {
      quantity = parseInt(texto.replace('qty:', ''));
    } else {
      const parsed = parseInt(texto);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 99) quantity = parsed;
    }

    if (!quantity || quantity < 1) {
      respostas.push({
        type: 'buttons',
        body: MessagesConstants.QTD_INVALIDA,
        buttons: [{ id: 'qty:1', title: '✅ Adicionar (1un)' }, { id: 'item:back', title: '↩️ Voltar' }],
      });
      return true;
    }

    const foundProduct = products.find((product: Product) => String(product.id) === String(newCart.pending_item_id));
    if (!foundProduct) {
      newState = BotState.START;
      respostas.push(mainMenu());
      return true;
    }

    const existingItem = newCart.items.find((cartItem: CartItem) => cartItem.id === foundProduct.id);
    if (existingItem) {
      existingItem.qty += quantity;
    } else {
      newCart.items.push({ id: foundProduct.id, name: foundProduct.name, qty: quantity, price: Number(foundProduct.price), menuIdx: products.indexOf(foundProduct) + 1 });
    }
    newCart.pending_item_id = null;
    newCart.pending_item_name = '';

    const { total } = cartSummary(newCart.items);
    newState = BotState.AWAITING_MORE;
    respostas.push({
      type: 'buttons',
      body: MessagesConstants.ITEM_ADICIONADO(foundProduct.name, quantity) + MessagesConstants.TOTAL_PARCIAL(fmtBRL(total)) + '\n\nDeseja adicionar mais itens ou finalizar?',
      buttons: [{ id: '__add_more__', title: '➕ Adicionar mais' }, { id: 'finalizar', title: '✅ Finalizar' }],
    });
    return true;
  }

  private _handleMore(): boolean {
    if (texto === '__add_more__') {
      const savedCategory = newCart.browse_category;
      newState = savedCategory ? BotState.ORDERING_ITEMS : BotState.ORDERING_CAT;
      respostas.push(savedCategory ? itemsList(savedCategory, 'order', 0) : categoryList('order'));
      return true;
    }

    if (texto === 'finalizar') {
      const { lines, total } = cartSummary(newCart.items);
      const minOrder = parseFloat(config['min_order_value'] || '0');
      if (minOrder > 0 && total < minOrder) {
        respostas.push(MessagesConstants.ORDEM_MINIMO_ADDMORE(fmtBRL(minOrder), fmtBRL(total)));
        newState = BotState.AWAITING_MORE;
        respostas.push({ type: 'buttons', body: 'Adicionar mais para atingir o mínimo?', buttons: [{ id: '__add_more__', title: '➕ Adicionar mais' }] });
      } else {
        newState = BotState.CONFIRMING;
        respostas.push(confirmBtn(MessagesConstants.CONFIRMAR_PEDIDO(lines.join('\n'), fmtBRL(total))));
      }
      return true;
    }

    respostas.push({ type: 'buttons', body: MessagesConstants.ADICIONAR_MAIS_PERGUNTA, buttons: [{ id: '__add_more__', title: '➕ Adicionar mais' }, { id: 'finalizar', title: '✅ Finalizar' }] });
    return true;
  }
}
