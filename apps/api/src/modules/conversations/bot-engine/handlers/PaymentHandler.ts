import { paymentEmoji } from '../MessageBuilder.ts';
import { BotState, CartConstants } from '../shared/botEngine.constant.ts';
import { MessagesConstants } from '../shared/messages.constant.ts';
import { cartSummary, fmtBRL, generateOrderCode, parseTrocoInput } from '../shared/formatting.util.ts';
import type { OrderType, PaymentType, SplitPayment } from '../shared/botEngine.types.ts';
import { BaseHandler } from './BaseHandler.ts';

export class PaymentHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    const currentState = this.context.currentState;
    if (currentState === BotState.AWAITING_MIXED_METHOD) {
      return this._handleMixedMethod();
    }
    if (currentState === BotState.AWAITING_MIXED_AMOUNT) {
      return this._handleMixedAmount();
    }
    if (currentState === BotState.AWAITING_SPLIT_COUNT) {
      return this._handleSplitCount();
    }
    if (currentState === BotState.AWAITING_SPLIT_PAYMENT) {
      return this._handleSplitPayment();
    }
    if (currentState === BotState.AWAITING_SPLIT_CHANGE) {
      return this._handleSplitChange();
    }
    if (currentState === BotState.AWAITING_MIXED_CHANGE) {
      return this._handleMixedChange();
    }
    if (currentState === BotState.AWAITING_PAYMENT) {
      return this._handlePayment();
    }
    if (currentState === BotState.AWAITING_CHANGE) {
      return this._handleChange();
    }
    return false;
  }

  private _nonCashTypes(): PaymentType[] {
    return this.context.paymentTypes.filter((paymentType: PaymentType) => paymentType.name !== 'dinheiro');
  }

  private _resolveOrderTypeLabel(): string {
    const context = this.context;
    return (context.orderTypes.find((orderType: OrderType) => orderType.name === context.newCart.order_type) || { label: 'Retirada' }).label;
  }

  private _buildDeliveryLines(): { typeLabel: string; feeLine: string; addrFull: string } {
    const context = this.context;
    const addrFull = context.newCart.address + (context.newCart.complement ? ', ' + context.newCart.complement : '');
    const mapsLine = context.newCart.order_type === 'delivery' ? MessagesConstants.MAPS_LINE(addrFull) : '';
    const typeLabel = context.newCart.order_type === 'delivery'
      ? MessagesConstants.ENTREGA_LABEL(addrFull, mapsLine)
      : '🏃 *' + this._resolveOrderTypeLabel() + '*';
    const feeLine = context.newCart.delivery_fee > 0
      ? MessagesConstants.ENTREGA_LINE(fmtBRL(context.newCart.delivery_fee))
      : MessagesConstants.FRETE_LINE;
    return { typeLabel, feeLine, addrFull };
  }

  private _finalizeOrder(total: number, paymentName: string, paymentMethodLabel: string, changeFor: number | null): void {
    const context = this.context;
    const orderCode = generateOrderCode(context.tel);
    const { lines, total: subtotal } = cartSummary(context.newCart.items);
    const { typeLabel, feeLine, addrFull } = this._buildDeliveryLines();

    context.respostas.push(
      MessagesConstants.PEDIDO_CONFIRMADO_PREFIX
      + lines.join('\n')
      + '\n\n' + MessagesConstants.SUBTOTAL_LINE(fmtBRL(subtotal))
      + feeLine
      + '\n' + MessagesConstants.TOTAL_LINE(fmtBRL(total))
      + '\n\n' + typeLabel
      + MessagesConstants.PAGAMENTO_LINE(paymentMethodLabel, paymentEmoji(paymentName))
      + (changeFor ? MessagesConstants.TROCO_LINE(fmtBRL(changeFor)) : '')
      + MessagesConstants.PEDIDO_CODIGO(orderCode)
    );

    context.saveOrder = true;
    context.finalOrder = {
      tel: context.tel,
      customer_name: context.customerName,
      code: orderCode,
      items: context.newCart.items,
      subtotal,
      delivery_fee: context.newCart.delivery_fee,
      total,
      order_type: context.newCart.order_type,
      address: context.newCart.order_type === 'delivery' ? addrFull : '',
      maps_link: context.newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(addrFull)) : '',
      payment_method: paymentMethodLabel,
      change_for: changeFor,
    };
    context.newState = BotState.START;
    context.newCart = CartConstants.EMPTY();
    context.maybeAskOptIn();
  }

  private _handleMixedMethod(): boolean {
    const context = this.context;
    const texto = context.texto;
    const nonCashTypes = this._nonCashTypes();
    let choiceIndex = parseInt(texto) - 1;
    if (isNaN(choiceIndex) || choiceIndex < 0)
      choiceIndex = nonCashTypes.findIndex((paymentType: PaymentType) => paymentType.name === texto);
    const selectedType = nonCashTypes[choiceIndex];
    if (choiceIndex >= 0 && choiceIndex < nonCashTypes.length && selectedType) {
      context.newCart.mixed_method = selectedType.name;
      context.newCart.mixed_label = selectedType.label;
      const { total: subtotal } = cartSummary(context.newCart.items);
      const total = subtotal + context.newCart.delivery_fee;
      context.newState = BotState.AWAITING_MIXED_AMOUNT;
      context.respostas.push(MessagesConstants.MISTO_VALOR(fmtBRL(total), selectedType.label));
    } else {
      context.respostas.push(MessagesConstants.OPCAO_INVALIDA + '\n\n' + context.messages.nonCashOptions() + MessagesConstants.DIGITAR_NUMERO);
    }
    return true;
  }

  private _handleMixedAmount(): boolean {
    const context = this.context;
    const entered = parseFloat(context.texto.replace(',', '.'));
    const { total: subtotal } = cartSummary(context.newCart.items);
    const total = subtotal + context.newCart.delivery_fee;
    if (isNaN(entered) || entered <= 0) {
      context.respostas.push(MessagesConstants.MISTO_VALOR_INVALIDO(context.newCart.mixed_label || 'cartão'));
    } else if (entered >= total) {
      context.respostas.push(MessagesConstants.MISTO_VALOR_EXCEDE(context.newCart.mixed_label || 'cartão', fmtBRL(entered), fmtBRL(total)));
    } else {
      context.newCart.mixed_amount = entered;
      const cashPart = total - entered;
      context.newState = BotState.AWAITING_MIXED_CHANGE;
      context.respostas.push(MessagesConstants.MISTO_PARTE_DINHEIRO(fmtBRL(cashPart)));
    }
    return true;
  }

  private _handleSplitCount(): boolean {
    const context = this.context;
    const splitCount = parseInt(context.texto);
    if (!splitCount || splitCount < 2 || splitCount > 30) {
      context.respostas.push(MessagesConstants.DIVIDIR_INVALIDO);
    } else {
      context.newCart.split_count = splitCount;
      context.newCart.split_current = 1;
      context.newCart.split_payments = [];
      const { total: subtotal } = cartSummary(context.newCart.items);
      const total = subtotal + context.newCart.delivery_fee;
      const perPerson = fmtBRL(total / splitCount);
      context.newState = BotState.AWAITING_SPLIT_PAYMENT;
      context.respostas.push(context.messages.splitPersonPaymentList(1, splitCount, perPerson));
    }
    return true;
  }

  private _handleSplitPayment(): boolean {
    const context = this.context;
    const texto = context.texto;
    let choiceIndex = parseInt(texto) - 1;
    if (isNaN(choiceIndex) || choiceIndex < 0)
      choiceIndex = context.paymentTypes.findIndex((paymentType: PaymentType) => paymentType.name === texto);

    const { total: subtotal } = cartSummary(context.newCart.items);
    const total = subtotal + context.newCart.delivery_fee;
    const splitTotal = context.newCart.split_count;
    const perPerson = total / splitTotal;

    const selectedPayment = context.paymentTypes[choiceIndex];
    if (choiceIndex < 0 || choiceIndex >= context.paymentTypes.length || !selectedPayment) {
      context.respostas.push(context.messages.splitPersonPaymentList(context.newCart.split_current, splitTotal, fmtBRL(perPerson)));
      return true;
    }

    if (selectedPayment.name === 'dinheiro') {
      context.newCart.payment_method = 'dinheiro';
      context.newState = BotState.AWAITING_SPLIT_CHANGE;
      context.respostas.push(MessagesConstants.DIVIDIR_TROCO(context.newCart.split_current, fmtBRL(perPerson)));
    } else {
      const payments = Array.isArray(context.newCart.split_payments) ? context.newCart.split_payments : [];
      payments.push({ person: context.newCart.split_current, label: paymentEmoji(selectedPayment.name) + ' ' + selectedPayment.label, change_for: null });
      context.newCart.split_payments = payments;

      if (context.newCart.split_current >= splitTotal) {
        this._finalizeSplitOrder(total, subtotal, splitTotal, perPerson, payments);
      } else {
        context.newCart.split_current = context.newCart.split_current + 1;
        context.newState = BotState.AWAITING_SPLIT_PAYMENT;
        context.respostas.push(context.messages.splitPersonPaymentList(context.newCart.split_current, splitTotal, fmtBRL(perPerson)));
      }
    }
    return true;
  }

  private _handleSplitChange(): boolean {
    const context = this.context;
    const texto = context.texto;
    const { total: subtotal } = cartSummary(context.newCart.items);
    const total = subtotal + context.newCart.delivery_fee;
    const splitTotal = context.newCart.split_count;
    const perPerson = total / splitTotal;

    let changeFor: number | null = null;
    if (texto !== 'não' && texto !== 'nao') {
      const changeValue = parseTrocoInput(texto, perPerson);
      if (changeValue === null || changeValue <= perPerson) {
        context.respostas.push(MessagesConstants.DIVIDIR_TROCO_INVALIDO(fmtBRL(perPerson)));
        context.earlyResponse = context.buildPayload();
        return true;
      }
      changeFor = changeValue;
    }

    const payments = Array.isArray(context.newCart.split_payments) ? context.newCart.split_payments : [];
    payments.push({ person: context.newCart.split_current, label: '💵 Dinheiro', change_for: changeFor });
    context.newCart.split_payments = payments;

    if (context.newCart.split_current >= splitTotal) {
      this._finalizeSplitOrder(total, subtotal, splitTotal, perPerson, payments);
    } else {
      context.newCart.split_current = context.newCart.split_current + 1;
      context.newState = BotState.AWAITING_SPLIT_PAYMENT;
      context.respostas.push(context.messages.splitPersonPaymentList(context.newCart.split_current, splitTotal, fmtBRL(perPerson)));
    }
    return true;
  }

  private _finalizeSplitOrder(total: number, subtotal: number, splitTotal: number, perPerson: number, payments: SplitPayment[]): void {
    const context = this.context;
    const orderCode = generateOrderCode(context.tel);
    const { typeLabel, feeLine, addrFull } = this._buildDeliveryLines();
    const splitLines = payments.map((splitPayment: SplitPayment) =>
      MessagesConstants.SPLIT_PERSON_LINE(splitPayment.person, splitPayment.label, splitPayment.change_for ? fmtBRL(splitPayment.change_for) : null)
    ).join('\n');

    context.respostas.push(
      MessagesConstants.PEDIDO_CONFIRMADO_PREFIX
      + cartSummary(context.newCart.items).lines.join('\n')
      + '\n\n' + MessagesConstants.SUBTOTAL_LINE(fmtBRL(subtotal))
      + feeLine
      + '\n' + MessagesConstants.TOTAL_LINE(fmtBRL(total))
      + '\n\n' + typeLabel
      + MessagesConstants.DIVISAO_HEADER(splitTotal, fmtBRL(perPerson))
      + splitLines
      + MessagesConstants.PEDIDO_CODIGO(orderCode)
    );

    context.saveOrder = true;
    context.finalOrder = {
      tel: context.tel,
      customer_name: context.customerName,
      code: orderCode,
      items: context.newCart.items,
      subtotal,
      delivery_fee: context.newCart.delivery_fee,
      total,
      order_type: context.newCart.order_type,
      address: context.newCart.order_type === 'delivery' ? addrFull : '',
      maps_link: context.newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(addrFull)) : '',
      payment_method: 'dividido: ' + payments.map((splitPayment: SplitPayment) => splitPayment.label).join(', '),
      change_for: null,
      split_count: splitTotal,
      split_payments: payments,
    };
    context.newState = BotState.START;
    context.newCart = CartConstants.EMPTY();
    context.maybeAskOptIn();
  }

  private _handleMixedChange(): boolean {
    const context = this.context;
    const texto = context.texto;
    const { total: subtotal } = cartSummary(context.newCart.items);
    const total = subtotal + context.newCart.delivery_fee;
    const entered = context.newCart.mixed_amount;
    const cashPart = total - entered;

    let changeFor: number | null = null;
    if (texto !== 'não' && texto !== 'nao') {
      const changeValue = parseTrocoInput(texto, cashPart);
      if (changeValue === null || changeValue <= cashPart) {
        context.respostas.push(MessagesConstants.DIVIDIR_TROCO_INVALIDO(fmtBRL(cashPart)));
        context.earlyResponse = context.buildPayload();
        return true;
      }
      changeFor = changeValue;
    }

    const orderCode = generateOrderCode(context.tel);
    const { typeLabel, feeLine, addrFull } = this._buildDeliveryLines();
    const changeInfo = changeFor ? ' _(troco p/ R$ ' + fmtBRL(changeFor) + ')_' : '';

    context.respostas.push(
      MessagesConstants.PEDIDO_CONFIRMADO_PREFIX
      + cartSummary(context.newCart.items).lines.join('\n')
      + '\n\n' + MessagesConstants.SUBTOTAL_LINE(fmtBRL(subtotal))
      + feeLine
      + '\n' + MessagesConstants.TOTAL_LINE(fmtBRL(total))
      + '\n\n' + typeLabel
      + '\n' + paymentEmoji(context.newCart.mixed_method || '') + ' *' + (context.newCart.mixed_label || 'Cartão') + ':* R$ ' + fmtBRL(entered)
      + '\n💵 *Dinheiro:* R$ ' + fmtBRL(cashPart) + changeInfo
      + MessagesConstants.PEDIDO_CODIGO(orderCode)
    );

    context.saveOrder = true;
    context.finalOrder = {
      tel: context.tel,
      customer_name: context.customerName,
      code: orderCode,
      items: context.newCart.items,
      subtotal,
      delivery_fee: context.newCart.delivery_fee,
      total,
      order_type: context.newCart.order_type,
      address: context.newCart.order_type === 'delivery' ? addrFull : '',
      maps_link: context.newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(addrFull)) : '',
      payment_method: (context.newCart.mixed_label || 'misto') + ' + dinheiro',
      change_for: changeFor,
    };
    context.newState = BotState.START;
    context.newCart = CartConstants.EMPTY();
    context.maybeAskOptIn();
    return true;
  }

  private _handlePayment(): boolean {
    const context = this.context;
    const texto = context.texto;
    let choiceIndex = parseInt(texto) - 1;
    if (isNaN(choiceIndex) || choiceIndex < 0)
      choiceIndex = context.paymentTypes.findIndex((paymentType: PaymentType) => paymentType.name === texto);

    const selectedPayment = context.paymentTypes[choiceIndex];
    if (choiceIndex >= 0 && choiceIndex < context.paymentTypes.length && selectedPayment) {
      context.newCart.payment_method = selectedPayment.name;
      const { total: subtotal } = cartSummary(context.newCart.items);
      const total = subtotal + context.newCart.delivery_fee;

      if (selectedPayment.name === 'dinheiro') {
        context.newState = BotState.AWAITING_CHANGE;
        context.respostas.push(MessagesConstants.PAGAMENTO_DINHEIRO(fmtBRL(total)));
      } else {
        const pixInfo = (selectedPayment.name === 'pix' && context.pixKey)
          ? MessagesConstants.PIX_INFO(context.pixKey, context.pixName)
          : '';
        const splitLine = context.newCart.split_count > 1
          ? MessagesConstants.SPLIT_LINE(context.newCart.split_count, fmtBRL(total / context.newCart.split_count))
          : '';
        const orderCode = generateOrderCode(context.tel);
        const { typeLabel, feeLine, addrFull } = this._buildDeliveryLines();

        context.respostas.push(
          MessagesConstants.PEDIDO_CONFIRMADO_PREFIX
          + cartSummary(context.newCart.items).lines.join('\n')
          + '\n\n' + MessagesConstants.SUBTOTAL_LINE(fmtBRL(subtotal))
          + feeLine
          + '\n' + MessagesConstants.TOTAL_LINE(fmtBRL(total))
          + splitLine
          + '\n\n' + typeLabel
          + MessagesConstants.PAGAMENTO_LINE(selectedPayment.label, paymentEmoji(selectedPayment.name))
          + pixInfo
          + MessagesConstants.PEDIDO_CODIGO(orderCode)
        );

        context.saveOrder = true;
        context.finalOrder = {
          tel: context.tel,
          customer_name: context.customerName,
          code: orderCode,
          items: context.newCart.items,
          subtotal,
          delivery_fee: context.newCart.delivery_fee,
          total,
          order_type: context.newCart.order_type,
          address: context.newCart.order_type === 'delivery' ? addrFull : '',
          maps_link: context.newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(addrFull)) : '',
          payment_method: selectedPayment.name,
          change_for: null,
        };
        context.newState = BotState.START;
        context.newCart = CartConstants.EMPTY();
        context.maybeAskOptIn();
      }
      return true;
    }

    if (texto === 'dividir' || parseInt(texto) === context.paymentTypes.length + 1 || texto.toLowerCase().includes('dividir')) {
      context.newState = BotState.AWAITING_SPLIT_COUNT;
      context.respostas.push(MessagesConstants.DIVIDIR_CONTA);
      return true;
    }

    if (texto === 'misto' || parseInt(texto) === context.paymentTypes.length + 2 || texto.toLowerCase().includes('misto')) {
      const nonCashTypes = this._nonCashTypes();
      const firstNonCash = nonCashTypes[0];
      if (nonCashTypes.length === 0 || !firstNonCash) {
        context.respostas.push(MessagesConstants.SEM_FORMAS_MISTO);
      } else if (nonCashTypes.length === 1) {
        context.newCart.mixed_method = firstNonCash.name;
        context.newCart.mixed_label = firstNonCash.label;
        const { total: subtotal } = cartSummary(context.newCart.items);
        const total = subtotal + context.newCart.delivery_fee;
        context.newState = BotState.AWAITING_MIXED_AMOUNT;
        context.respostas.push(MessagesConstants.MISTO_VALOR(fmtBRL(total), firstNonCash.label));
      } else {
        context.newState = BotState.AWAITING_MIXED_METHOD;
        context.respostas.push(MessagesConstants.MISTO_ESCOLHER_METODO(context.messages.nonCashOptions()));
      }
      return true;
    }

    context.respostas.push(context.messages.paymentList(context.newCart.split_count));
    return true;
  }

  private _handleChange(): boolean {
    const context = this.context;
    const texto = context.texto;
    const { total: subtotal } = cartSummary(context.newCart.items);
    const total = subtotal + context.newCart.delivery_fee;

    let changeValue: number | null = null;
    if (texto !== 'não' && texto !== 'nao') {
      changeValue = parseTrocoInput(texto, total);
      if (changeValue === null || changeValue <= total) {
        context.respostas.push(MessagesConstants.TROCO_INVALIDO(fmtBRL(total)));
        context.earlyResponse = context.buildPayload();
        return true;
      }
    }

    this._finalizeOrder(total, 'dinheiro', 'Dinheiro', changeValue);
    return true;
  }
}
