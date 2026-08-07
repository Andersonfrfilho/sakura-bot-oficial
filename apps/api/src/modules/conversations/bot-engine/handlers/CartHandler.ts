import { confirmBtn, mainMenu, yesNo } from '../MessageBuilder.ts';
import { BotState, CartConstants } from '../shared/botEngine.constant.ts';
import { MessagesConstants } from '../shared/messages.constant.ts';
import { cartSummary, fmtBRL } from '../shared/formatting.util.ts';
import type { CartItem, OrderItem, Product } from '../shared/botEngine.types.ts';
import { BaseHandler } from './BaseHandler.ts';

export class CartHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    const context = this.context;
    const texto = context.texto;

    if (texto === 'sim' && context.currentState === BotState.REPEAT_ORDER) {
      const lastOrder = context.lastOrder;
      if (lastOrder && Array.isArray(lastOrder.items)) {
        const items: CartItem[] = lastOrder.items.map((orderItem: OrderItem): CartItem | null => {
          const product = context.products.find((candidate: Product) => candidate.id === orderItem.id);
          return product
            ? {
                id: product.id,
                name: product.name,
                qty: orderItem.qty,
                price: Number(product.price),
                menuIdx: context.products.indexOf(product) + 1,
              }
            : null;
        }).filter((item: CartItem | null): item is CartItem => item !== null);
        context.newCart.items = items;
        context.newState = BotState.ORDERING;
        const { lines, total } = cartSummary(items);
        context.respostas.push(MessagesConstants.PEDIDO_REPETIDO + lines.join('\n') + '\n\n*Total: R$ ' + fmtBRL(total) + '*' + MessagesConstants.PEDIDO_REPETIDO_SUFFIX);
      } else {
        context.newState = BotState.START;
        context.respostas.push(MessagesConstants.PEDIDO_REPETIDO_NAO_ENCONTRADO);
      }
      return true;
    }

    if ((texto === 'não' || texto === 'nao') && context.currentState === BotState.REPEAT_ORDER) {
      context.newState = BotState.START;
      context.newCart = CartConstants.EMPTY();
      context.respostas.push(MessagesConstants.REPEAT_ORDER_RECUSA);
      context.respostas.push(mainMenu());
      return true;
    }

    if (context.currentState === BotState.REPEAT_ORDER) {
      context.respostas.push(yesNo(MessagesConstants.REPEAT_ORDER_PROMPT));
      return true;
    }

    if (texto === 'carrinho') {
      if (context.newCart.items.length === 0) {
        context.respostas.push(MessagesConstants.CARRINHO_VAZIO);
      } else {
        const { lines, total } = cartSummary(context.newCart.items);
        context.respostas.push(MessagesConstants.CARRINHO_RESUMO_PREFIX + lines.join('\n') + '\n\n*Total: R$ ' + fmtBRL(total) + '*' + MessagesConstants.CARRINHO_RESUMO_SUFFIX);
      }
      return true;
    }

    if (texto === 'finalizar') {
      if (context.newCart.items.length === 0) {
        context.respostas.push(MessagesConstants.CARRINHO_VAZIO);
      } else {
        const { lines, total } = cartSummary(context.newCart.items);
        const minOrder = context.minOrderValue;
        if (minOrder > 0 && total < minOrder) {
          context.respostas.push(MessagesConstants.VALOR_MINIMO(fmtBRL(minOrder), fmtBRL(total)));
        } else {
          context.newState = BotState.CONFIRMING;
          context.respostas.push(confirmBtn(MessagesConstants.CONFIRMAR_PEDIDO(lines.join('\n'), fmtBRL(total))));
        }
      }
      return true;
    }

    if ((texto === 'confirmar' || texto === 'sim') && context.currentState === BotState.CONFIRMING) {
      const firstOrderType = context.orderTypes[0];
      if (context.orderTypes.length > 1) {
        context.newState = BotState.AWAITING_TYPE;
        context.respostas.push(context.messages.orderTypeBtn());
      } else if (context.featureDelivery) {
        context.newCart.order_type = 'delivery';
        context.newState = BotState.AWAITING_ADDRESS;
        context.respostas.push(MessagesConstants.SOLICITAR_ENDERECO);
      } else {
        context.newCart.order_type = firstOrderType ? firstOrderType.name : 'retirada';
        context.newCart.delivery_fee = 0;
        context.newState = BotState.AWAITING_PAYMENT;
        context.respostas.push(MessagesConstants.TIPO_CONFIRMADO(firstOrderType ? firstOrderType.label : 'Retirada'));
        context.respostas.push(context.messages.paymentList(context.newCart.split_count));
      }
      return true;
    }

    return false;
  }
}
