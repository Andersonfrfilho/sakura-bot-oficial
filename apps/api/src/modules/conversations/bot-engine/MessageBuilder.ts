// Porte mecânico dos builders de mensagem de src/setup.ts: o que dependia de globals de catálogo
// agora chega pelo construtor.

import { ITEMS_PAGE_SIZE } from './shared/botEngine.constant.ts';
import { MessagesConstants } from './shared/messages.constant.ts';
import { fmtBRL } from './shared/formatting.util.ts';
import type {
  BuildRepeatOrderLinesParams,
  ButtonMessage,
  ListMessage,
  ListRow,
  LocationMessage,
  OrderType,
  PaymentType,
  Product,
  TextMenuMessage,
} from './shared/botEngine.types.ts';

export function paymentEmoji(name: string): string {
  if (name === 'pix') return '🔷';
  if (name === 'dinheiro') return '💵';
  return '💳';
}

export function mainMenu(): ButtonMessage {
  return {
    type: 'buttons',
    body: 'Como posso ajudar? 😊\n\n_Pedidos: *meu pedido* · Notificações: *notificações*_\n_Digite *sair* para recomeçar._',
    buttons: [
      { id: '2', title: '🛒 Fazer Pedido' },
      { id: '3', title: '📋 Reservar Mesa' },
      { id: '4', title: '👤 Falar com Atendente' },
    ],
  };
}

export function yesNo(body: string): ButtonMessage {
  return { type: 'buttons', body, buttons: [{ id: 'sim', title: 'Sim ✅' }, { id: 'não', title: 'Não ❌' }] };
}

export function confirmBtn(body: string): ButtonMessage {
  return { type: 'buttons', body, buttons: [{ id: 'sim', title: '✅ Confirmar' }, { id: 'não', title: '❌ Cancelar' }] };
}

export function offerPickupBtn(body: string): ButtonMessage {
  return { type: 'buttons', body, buttons: [{ id: 'sim', title: '✅ Sim, retirar' }, { id: 'não', title: '📍 Outro endereço' }] };
}

export function locationMsg(lat: number, lng: number, name: string, address: string): LocationMessage {
  return {
    type: 'location',
    latitude: lat,
    longitude: lng,
    name: name || 'Endereço de entrega',
    address: address || '',
  };
}

export type MessageBuilderDependencies = {
  readonly products: Product[];
  readonly orderTypes: OrderType[];
  readonly paymentTypes: PaymentType[];
};

export class MessageBuilder {
  private readonly products: Product[];
  private readonly orderTypes: OrderType[];
  private readonly paymentTypes: PaymentType[];

  constructor(dependencies: MessageBuilderDependencies) {
    this.products = dependencies.products;
    this.orderTypes = dependencies.orderTypes;
    this.paymentTypes = dependencies.paymentTypes;
  }

  orderTypeBtn(): ButtonMessage {
    return {
      type: 'buttons',
      body: MessagesConstants.SOLICITAR_TIPO_PEDIDO,
      buttons: this.orderTypes
        .filter((orderType: OrderType) => orderType.active !== false)
        .slice(0, 3)
        .map((orderType: OrderType) => ({ id: orderType.name, title: orderType.label })),
    };
  }

  paymentList(splitCount: number, hideMixed?: boolean): ListMessage {
    const rows: ListRow[] = this.paymentTypes.map((paymentType: PaymentType) => ({
      id: paymentType.name,
      title: paymentEmoji(paymentType.name) + ' ' + paymentType.label,
    }));
    if (!splitCount || splitCount < 2) rows.push({ id: 'dividir', title: '👥 Dividir entre pessoas' });
    if (!hideMixed && this.paymentTypes.length > 1) rows.push({ id: 'misto', title: '💰 Pagamento misto' });
    return {
      type: 'list',
      body: MessagesConstants.SOLICITAR_PAGAMENTO,
      button: 'Ver opções',
      sections: [{ title: 'Forma de Pagamento', rows }],
    };
  }

  splitPersonPaymentList(personNum: number, totalPersons: number, perPersonStr: string): ListMessage {
    const rows: ListRow[] = this.paymentTypes.map((paymentType: PaymentType) => ({
      id: paymentType.name,
      title: paymentEmoji(paymentType.name) + ' ' + paymentType.label,
    }));
    return {
      type: 'list',
      body: '👥 *' + totalPersons + ' pessoas — R$ ' + perPersonStr + '/pessoa*\n\n*Pessoa ' + personNum + ' de ' + totalPersons + ':* Como vai pagar?',
      button: 'Ver opções',
      sections: [{ title: 'Forma de Pagamento', rows }],
    };
  }

  notifBtn(currentOptIn: boolean | null): ButtonMessage {
    const status = currentOptIn === true
      ? '🔔 *Notificações ativas*\nVocê recebe promoções e novidades.'
      : currentOptIn === false
        ? '🔕 *Notificações desativadas*\nVocê não recebe promoções.'
        : '🔔 *Notificações*\nConfigure suas preferências:';
    if (currentOptIn === true) {
      return { type: 'buttons', body: status, buttons: [{ id: 'desativar', title: '🔕 Desativar' }, { id: '0', title: '↩️ Voltar' }] };
    }
    return { type: 'buttons', body: status, buttons: [{ id: 'ativar', title: '🔔 Ativar' }, { id: '0', title: '↩️ Voltar' }] };
  }

  categoryList(context: string): ListMessage | string {
    if (!this.products || this.products.length === 0) return MessagesConstants.CARDAPIO_INDISPONIVEL;
    const categories = [...new Set(this.products.map((product: Product) => product.category || 'Outros'))];
    const prefix = context === 'order' ? 'order_cat:' : 'cat:';
    const rows: ListRow[] = categories.map((categoryName: string) => {
      const categoryItems = this.products.filter((product: Product) => (product.category || 'Outros') === categoryName);
      const categoryTitle = ((categoryItems[0]?.emoji || '🍽️') + ' ' + categoryName).slice(0, 24);
      return {
        id: prefix + categoryName.toLowerCase(),
        title: categoryTitle,
        description: categoryItems.length + ' item(s)',
      };
    });
    const body = context === 'order' ? '🛒 *Fazer Pedido*\n\nEscolha uma categoria:' : '🍣 *Cardápio*\n\nEscolha uma categoria:';
    return { type: 'list', body, button: 'Ver categorias', sections: [{ title: 'Categorias', rows }] };
  }

  itemsList(categoryName: string, context: string, page: number): TextMenuMessage {
    const currentPage = page || 0;
    const allItems = this.products.filter((product: Product) => (product.category || 'Outros') === categoryName);
    const start = currentPage * ITEMS_PAGE_SIZE;
    const slice = allItems.slice(start, start + ITEMS_PAGE_SIZE);
    const hasMore = allItems.length > start + ITEMS_PAGE_SIZE;
    const lines: string[] = ['🍽️ *' + categoryName + '*\n'];
    slice.forEach((product: Product, index: number) => {
      const priceStr = 'R$ ' + fmtBRL(product.price);
      const descriptionStr = product.description ? ' — _' + String(product.description).slice(0, 60) + '_' : '';
      lines.push((start + index + 1) + '. ' + (product.emoji ? product.emoji + ' ' : '') + product.name + ' — ' + priceStr + descriptionStr);
    });
    if (hasMore) lines.push(MessagesConstants.PROXIMA_PAGINA(currentPage + 2));
    lines.push(MessagesConstants.VOLTAR_INSTRUCAO);
    return {
      type: 'text_menu',
      body: lines.join('\n'),
      items: slice.map((product: Product, index: number) => ({ num: start + index + 1, id: product.id, name: product.name })),
      categoryName,
      context,
      page: currentPage,
      hasMore,
    };
  }

  nonCashOptions(): string {
    return this.paymentTypes
      .filter((paymentType: PaymentType) => paymentType.name !== 'dinheiro')
      .map((paymentType: PaymentType, index: number) => (index + 1) + '. ' + paymentType.label)
      .join('\n');
  }

  buildRepeatOrderLines(params: BuildRepeatOrderLinesParams): string[] {
    const { lastOrder: lastOrderParam, products: catalog, header } = params;
    const items = lastOrderParam.items;
    const lines: string[] = [header + '\n'];
    let newTotal = 0;
    let hasChanges = false;
    const unavailable: string[] = [];

    for (const item of items) {
      const currentProduct = catalog.find((product: Product) => product.id === item.id);
      if (!currentProduct) { unavailable.push(item.name); continue; }
      const oldUnitPrice = Number(item.price);
      const newUnitPrice = Number(currentProduct.price);
      const newLineTotal = newUnitPrice * item.qty;
      newTotal += newLineTotal;
      if (Math.abs(newUnitPrice - oldUnitPrice) >= 0.01) {
        hasChanges = true;
        const diff = newLineTotal - (oldUnitPrice * item.qty);
        const sign = diff > 0 ? '+' : '−';
        const icon = diff < 0 ? ' 🎉' : ' 📢';
        lines.push('• ' + item.name + ' × ' + item.qty + ' — *R$ ' + fmtBRL(newLineTotal) + '*' + icon
          + '\n  _era R$ ' + fmtBRL(oldUnitPrice * item.qty) + ' (' + sign + 'R$ ' + fmtBRL(Math.abs(diff)) + ')_');
      } else {
        lines.push('• ' + item.name + ' — R$ ' + fmtBRL(newUnitPrice) + ' × ' + item.qty + ' — R$ ' + fmtBRL(newLineTotal));
      }
    }
    if (unavailable.length > 0) lines.push('\n⚠️ _Fora do cardápio: ' + unavailable.join(', ') + '_');
    const oldTotal = Number(lastOrderParam.total);
    if (hasChanges && Math.abs(newTotal - oldTotal) >= 0.01) {
      const totalDiff = newTotal - oldTotal;
      const sign = totalDiff > 0 ? '+' : '−';
      lines.push('\n*Total: R$ ' + fmtBRL(newTotal) + '* _(' + sign + 'R$ ' + fmtBRL(Math.abs(totalDiff)) + ' vs último pedido)_');
    } else {
      lines.push('\n*Total: R$ ' + fmtBRL(newTotal) + '*');
    }
    return lines;
  }
}
