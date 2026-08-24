import { mainMenu } from '../MessageBuilder.ts';
import { BotState } from '../shared/botEngine.constant.ts';
import { MessagesConstants } from '../shared/messages.constant.ts';
import { cartSummary, fmtBRL } from '../shared/formatting.util.ts';
import type { CartItem, Product } from '../shared/botEngine.types.ts';
import { BaseHandler } from './BaseHandler.ts';

export class FallbackHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    const context = this.context;
    const products = context.products;
    const textLines = context.texto.split(/[\n,+]/).map((line: string) => line.trim()).filter(Boolean);
    const parsedItems: CartItem[] = [];
    const unrecognizedLines: string[] = [];

    for (const line of textLines) {
      const indexQtyMatch = line.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
      if (indexQtyMatch) {
        const productIndex = parseInt(indexQtyMatch[1] ?? '') - 1;
        const quantity = parseInt(indexQtyMatch[2] ?? '');
        if (quantity < 1) { unrecognizedLines.push(line); continue; }
        const product = products[productIndex];
        if (productIndex >= 0 && products && productIndex < products.length && product) {
          parsedItems.push({ id: product.id, name: product.name, qty: quantity, price: Number(product.price), menuIdx: productIndex + 1 });
        } else { unrecognizedLines.push(line); }
        continue;
      }

      const nameQtyMatch = line.match(/^(.+?)\s*[xX×]\s*(\d+)$/);
      if (nameQtyMatch) {
        const normalize = (source: string): string => source.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const searchTerm = normalize((nameQtyMatch[1] ?? '').trim());
        const quantity = parseInt(nameQtyMatch[2] ?? '');
        const foundProduct = products && products.find((product: Product) => normalize(product.name).includes(searchTerm));
        if (foundProduct && quantity >= 1) {
          parsedItems.push({ id: foundProduct.id, name: foundProduct.name, qty: quantity, price: Number(foundProduct.price), menuIdx: products.indexOf(foundProduct) + 1 });
        } else { unrecognizedLines.push(line); }
        continue;
      }

      const numberOnlyMatch = line.match(/^(\d+)$/);
      if (numberOnlyMatch) {
        const productNumber = parseInt(numberOnlyMatch[1] ?? '');
        const product = products[productNumber - 1];
        if (productNumber >= 1 && products && productNumber <= products.length && product) {
          parsedItems.push({ id: product.id, name: product.name, qty: 1, price: Number(product.price), menuIdx: productNumber });
        } else { unrecognizedLines.push(line); }
      } else { unrecognizedLines.push(line); }
    }

    if (parsedItems.length > 0) {
      const dedupedItems: CartItem[] = [];
      for (const parsedItem of parsedItems) {
        const existingInDeduped = dedupedItems.find((deduped: CartItem) => deduped.id === parsedItem.id);
        if (existingInDeduped) { existingInDeduped.qty += parsedItem.qty; } else { dedupedItems.push({ ...parsedItem }); }
      }
      const hadItemsBefore = context.newCart.items.length > 0;
      for (const dedupedItem of dedupedItems) {
        const existingInCart = context.newCart.items.find((cartItem: CartItem) => cartItem.id === dedupedItem.id);
        if (existingInCart) { existingInCart.qty += dedupedItem.qty; } else { context.newCart.items.push(dedupedItem); }
      }
      context.newState = BotState.ORDERING;

      const addedLines = dedupedItems.map((dedupedItem: CartItem) =>
        '• [' + (dedupedItem.menuIdx || '') + '] ' + dedupedItem.name + ' — R$ ' + fmtBRL(dedupedItem.price) + ' × ' + dedupedItem.qty + ' — R$ ' + fmtBRL(dedupedItem.price * dedupedItem.qty)
      ).join('\n');
      const { lines: cartLines, total } = cartSummary(context.newCart.items);

      let message = MessagesConstants.ADICIONAR_TEXTO + addedLines;
      if (hadItemsBefore) {
        message += MessagesConstants.CARRINHO_ATUAL + cartLines.join('\n') + '\n' + MessagesConstants.TOTAL_LINE_SIMPLES(fmtBRL(total));
      } else {
        message += MessagesConstants.TOTAL_PARCIAL(fmtBRL(total));
      }
      if (unrecognizedLines.length > 0) message += MessagesConstants.NAO_RECONHECIDO(unrecognizedLines.join(', '));
      message += MessagesConstants.INSTRUCOES_ORDERING;
      context.respostas.push(message);
      return true;
    }

    if (context.currentState === BotState.START) {
      context.respostas.push(context.msgWelcome);
      context.respostas.push(mainMenu());
    } else {
      context.respostas.push(MessagesConstants.NAO_ENTENDI);
    }
    return true;
  }
}
