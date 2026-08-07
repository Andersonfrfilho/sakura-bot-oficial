import { confirmBtn, mainMenu } from '../MessageBuilder.ts';
import { BotState, ITEMS_PAGE_SIZE } from '../shared/botEngine.constant.ts';
import { MessagesConstants } from '../shared/messages.constant.ts';
import { cartSummary, fmtBRL } from '../shared/formatting.util.ts';
import type { CartItem, Product } from '../shared/botEngine.types.ts';
import { BaseHandler } from './BaseHandler.ts';

export class OrderingHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    const currentState = this.context.currentState;
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
    const context = this.context;
    const texto = context.texto;
    const categoryInput = texto.replace(/^(order_cat:|cat:)/, '');
    if (categoryInput === 'back' || texto === '0' || texto === 'voltar') {
      context.newState = BotState.START;
      context.respostas.push(mainMenu());
      return true;
    }

    const allCategories = [...new Set(context.products.map((product: Product) => product.category || 'Outros'))];
    const foundCategory = allCategories.find((category: string) => category.toLowerCase() === categoryInput.toLowerCase());

    if (foundCategory) {
      context.newCart.browse_category = foundCategory;
      context.newState = BotState.ORDERING_ITEMS;
      context.respostas.push(context.messages.itemsList(foundCategory, 'order', 0));
    } else {
      context.respostas.push(context.messages.categoryList('order'));
    }
    return true;
  }

  private _handleItems(): boolean {
    const context = this.context;
    const texto = context.texto;
    const currentCategory = context.newCart.browse_category || '';

    if (texto === 'cat:back' || texto === 'order_cat:back' || texto === '0' || texto === 'voltar') {
      context.newState = BotState.ORDERING_CAT;
      context.respostas.push(context.messages.categoryList('order'));
      return true;
    }

    if (texto.startsWith('page:')) {
      const pageParts = texto.split(':');
      const pageContext = pageParts[1] ?? '';
      const pageCategoryRaw = pageParts.slice(2, -1).join(':');
      const pageNumber = parseInt(pageParts[pageParts.length - 1] ?? '');
      const resolvedCategory = context.products.map((product: Product) => product.category || 'Outros')
        .find((category: string) => category.toLowerCase() === pageCategoryRaw.toLowerCase()) || pageCategoryRaw;
      context.respostas.push(context.messages.itemsList(resolvedCategory, pageContext, pageNumber));
      return true;
    }

    const allCategoryItems = context.products.filter((product: Product) => (product.category || 'Outros') === currentCategory);
    const currentPage = context.newCart.browse_page || 0;
    const pageStart = currentPage * ITEMS_PAGE_SIZE;

    if (texto === 'próxima' || texto === 'proxima' || texto === 'próximo' || texto === 'proximo') {
      if (allCategoryItems.length > pageStart + ITEMS_PAGE_SIZE) {
        context.newCart.browse_page = currentPage + 1;
        context.respostas.push(context.messages.itemsList(currentCategory, 'order', currentPage + 1));
      } else {
        context.respostas.push(context.messages.itemsList(currentCategory, 'order', 0));
      }
      return true;
    }

    const itemNumber = parseInt(texto);
    const selectedProduct = allCategoryItems[itemNumber - 1];
    if (!isNaN(itemNumber) && itemNumber >= 1 && itemNumber <= allCategoryItems.length && selectedProduct) {
      context.newCart.pending_item_id = selectedProduct.id;
      context.newCart.pending_item_name = selectedProduct.name;
      context.newCart.browse_page = 0;
      context.newState = BotState.AWAITING_QTY;
      const descriptionText = selectedProduct.description ? '\n_' + selectedProduct.description + '_' : '';
      context.respostas.push({
        type: 'buttons',
        body: '🛒 *' + selectedProduct.name + '*\nR$ ' + fmtBRL(selectedProduct.price) + descriptionText,
        buttons: [
          { id: 'qty:1', title: '✅ Adicionar (1un)' },
          { id: 'qty:more', title: '✏️ Outra qtd' },
          { id: 'item:back', title: '↩️ Voltar' },
        ],
      });
    } else {
      context.respostas.push(context.messages.itemsList(currentCategory, 'order', currentPage));
    }
    return true;
  }

  private _handleQuantity(): boolean {
    const context = this.context;
    const texto = context.texto;

    if (texto === 'item:back') {
      context.newState = BotState.ORDERING_ITEMS;
      context.respostas.push(context.messages.itemsList(context.newCart.browse_category || '', 'order', context.newCart.browse_page || 0));
      return true;
    }

    if (texto === 'qty:more') {
      context.respostas.push(MessagesConstants.QTD_SOLICITAR);
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
      context.respostas.push({
        type: 'buttons',
        body: MessagesConstants.QTD_INVALIDA,
        buttons: [{ id: 'qty:1', title: '✅ Adicionar (1un)' }, { id: 'item:back', title: '↩️ Voltar' }],
      });
      return true;
    }

    const foundProduct = context.products.find((product: Product) => String(product.id) === String(context.newCart.pending_item_id));
    if (!foundProduct) {
      context.newState = BotState.START;
      context.respostas.push(mainMenu());
      return true;
    }

    const existingItem = context.newCart.items.find((cartItem: CartItem) => cartItem.id === foundProduct.id);
    if (existingItem) {
      existingItem.qty += quantity;
    } else {
      context.newCart.items.push({
        id: foundProduct.id,
        name: foundProduct.name,
        qty: quantity,
        price: Number(foundProduct.price),
        menuIdx: context.products.indexOf(foundProduct) + 1,
      });
    }
    context.newCart.pending_item_id = null;
    context.newCart.pending_item_name = '';

    const { lines: cartLines, total } = cartSummary(context.newCart.items);
    context.newState = BotState.AWAITING_MORE;
    context.respostas.push({
      type: 'buttons',
      body: MessagesConstants.ITEM_ADICIONADO(foundProduct.name, quantity)
        + '\n\n🛒 *Carrinho:*\n' + cartLines.join('\n')
        + '\n\n' + MessagesConstants.TOTAL_PARCIAL(fmtBRL(total))
        + '\n\nDeseja adicionar mais itens ou finalizar?',
      buttons: [{ id: '__add_more__', title: '➕ Adicionar mais' }, { id: 'finalizar', title: '✅ Finalizar' }],
    });
    return true;
  }

  private _handleMore(): boolean {
    const context = this.context;
    const texto = context.texto;

    if (texto === '__add_more__') {
      const savedCategory = context.newCart.browse_category;
      context.newState = savedCategory ? BotState.ORDERING_ITEMS : BotState.ORDERING_CAT;
      context.respostas.push(savedCategory
        ? context.messages.itemsList(savedCategory, 'order', 0)
        : context.messages.categoryList('order'));
      return true;
    }

    if (texto === 'finalizar') {
      const { lines, total } = cartSummary(context.newCart.items);
      const minOrder = context.minOrderValue;
      if (minOrder > 0 && total < minOrder) {
        context.respostas.push(MessagesConstants.ORDEM_MINIMO_ADDMORE(fmtBRL(minOrder), fmtBRL(total)));
        context.newState = BotState.AWAITING_MORE;
        context.respostas.push({
          type: 'buttons',
          body: 'Adicionar mais para atingir o mínimo?',
          buttons: [{ id: '__add_more__', title: '➕ Adicionar mais' }],
        });
      } else {
        context.newState = BotState.CONFIRMING;
        context.respostas.push(confirmBtn(MessagesConstants.CONFIRMAR_PEDIDO(lines.join('\n'), fmtBRL(total))));
      }
      return true;
    }

    context.respostas.push({
      type: 'buttons',
      body: MessagesConstants.ADICIONAR_MAIS_PERGUNTA,
      buttons: [{ id: '__add_more__', title: '➕ Adicionar mais' }, { id: 'finalizar', title: '✅ Finalizar' }],
    });
    return true;
  }
}
