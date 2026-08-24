import { mainMenu, yesNo } from '../MessageBuilder.ts';
import { BotState } from '../shared/botEngine.constant.ts';
import { MessagesConstants } from '../shared/messages.constant.ts';
import { capitalizeName, cartSummary, fmtBRL, validateName } from '../shared/formatting.util.ts';
import type { RecentOrder } from '../shared/botEngine.types.ts';
import { BaseHandler } from './BaseHandler.ts';

export class MiscHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    const context = this.context;
    const texto = context.texto;
    const expectingRawInput = context.expectingRawInput;

    if (!expectingRawInput && (texto === '5' || texto.startsWith('meu pedido') || texto.startsWith('meus pedido') || texto === 'pedidos')) {
      return this._handleMyOrders();
    }

    if (!expectingRawInput && (texto === '4' || texto.includes('atendente') || texto.includes('humano'))) {
      context.newState = BotState.HUMAN_HANDOFF;
      context.requestHumanHandoff = true;
      context.handoffCustomerName = context.customerName || '';
      context.respostas.push(MessagesConstants.CONECTANDO_ATENDENTE);
      return true;
    }

    if (!expectingRawInput && (texto === '6' || texto === 'notificacoes' || texto === 'notificações')) {
      context.respostas.push(context.messages.notifBtn(context.marketingOptIn));
      context.newState = BotState.NOTIFICATIONS_MENU;
      return true;
    }

    if (!expectingRawInput && (texto === '0' || texto === 'voltar')) {
      context.newState = BotState.START;
      context.respostas.push(MessagesConstants.VOLTAR_MENU);
      context.respostas.push(mainMenu());
      return true;
    }

    if (context.currentState === BotState.HUMAN_HANDOFF) {
      context.respostas.push(MessagesConstants.EM_ATENDIMENTO_HUMANO);
      return true;
    }

    if (context.currentState === BotState.AWAITING_ORDER_DETAIL) {
      return this._handleOrderDetail();
    }

    if (context.currentState === BotState.NOTIFICATIONS_MENU) {
      return this._handleNotificationsMenu();
    }

    if (context.currentState === BotState.AWAITING_NAME) {
      return this._handleName();
    }

    if (context.currentState === BotState.AWAITING_COMPLEMENT) {
      if (texto === 'ok' || texto === 'nao' || texto === 'não' || texto === 'sem complemento') {
        context.newCart.complement = '';
      } else {
        context.newCart.complement = texto.trim();
      }
      context.newState = BotState.AWAITING_PAYMENT;
      context.respostas.push(context.messages.paymentList(context.newCart.split_count));
      return true;
    }

    if (texto === 'status' || texto === 'meu pedido' || texto === 'pedido') {
      return this._handleLastOrderStatus();
    }

    if (texto === 'notificações' || texto === 'notificacoes' || texto === 'promoções' || texto === 'promocoes') {
      return this._handleNotifInfo();
    }

    if (texto.includes('desativar notifica') || texto.includes('desativar promoç')) {
      context.saveMarketingOptIn = true;
      context.marketingOptInValue = false;
      context.respostas.push(MessagesConstants.NOTIF_DESATIVADAS_OK);
      return true;
    }

    if (texto.includes('ativar notifica') || texto.includes('ativar promoç')) {
      context.saveMarketingOptIn = true;
      context.marketingOptInValue = true;
      context.respostas.push(MessagesConstants.NOTIF_ATIVADAS_OK);
      return true;
    }

    if (context.currentState === BotState.AWAITING_MARKETING_OPT_IN) {
      return this._handleMarketingOptIn();
    }

    return false;
  }

  private _statusLabel(status: string, orderType: string): string {
    const isDelivery = orderType === 'delivery';
    const statusMap: Record<string, string> = {
      received: MessagesConstants.STATUS_MAP.received,
      confirmed: MessagesConstants.STATUS_MAP.confirmed,
      preparing: MessagesConstants.STATUS_MAP.preparing,
      ready: isDelivery ? MessagesConstants.STATUS_MAP.ready_delivery : MessagesConstants.STATUS_MAP.ready_pickup,
      out_for_delivery: MessagesConstants.STATUS_MAP.out_for_delivery,
      delivered: MessagesConstants.STATUS_MAP.delivered,
      cancelled: MessagesConstants.STATUS_MAP.cancelled,
    };
    return statusMap[status] || status;
  }

  private _orderTypeLabel(orderType: string): string {
    return orderType === 'delivery'
      ? MessagesConstants.PEDIDO_DETALHE_TIPO_DELIVERY
      : orderType === 'retirada'
        ? MessagesConstants.PEDIDO_DETALHE_TIPO_RETIRADA
        : MessagesConstants.PEDIDO_DETALHE_TIPO_MESA;
  }

  private _handleMyOrders(): boolean {
    const context = this.context;
    if (!context.recentOrders || context.recentOrders.length === 0) {
      context.respostas.push(MessagesConstants.SEM_PEDIDOS);
      return true;
    }

    let message = MessagesConstants.PEDIDOS_HEADER;
    context.recentOrders.forEach((order: RecentOrder, index: number) => {
      const statusText = this._statusLabel(order.status, order.order_type);
      const typeLabel = this._orderTypeLabel(order.order_type);
      message += '*' + (index + 1) + '. #' + order.code + '*\n'
        + '   ' + typeLabel + ' — R$ ' + fmtBRL(order.total) + '\n'
        + '   ' + statusText + ' — ' + order.created_at + '\n\n';
    });
    message += MessagesConstants.PEDIDOS_FOOTER;
    context.respostas.push(message);
    context.newState = BotState.AWAITING_ORDER_DETAIL;
    return true;
  }

  private _handleOrderDetail(): boolean {
    const context = this.context;
    const texto = context.texto;
    const codeInput = texto.replace(/^#/, '').toUpperCase();
    const foundOrder = context.recentOrders.find((order: RecentOrder) => order.code.toUpperCase() === codeInput);

    if (foundOrder) {
      const typeLabel = this._orderTypeLabel(foundOrder.order_type);
      const statusText = this._statusLabel(foundOrder.status, foundOrder.order_type);
      context.respostas.push(
        MessagesConstants.PEDIDO_DETALHE_HEADER(foundOrder.code)
        + typeLabel + ' — R$ ' + fmtBRL(foundOrder.total) + '\n'
        + statusText + ' — ' + foundOrder.created_at + '\n'
        + (foundOrder.payment_method ? '💳 ' + foundOrder.payment_method + '\n' : '')
        + '\n_' + (foundOrder.items_count || 0) + ' item(s)_\n\n'
        + MessagesConstants.PEDIDO_DETALHE_FOOTER
      );
    } else if (texto === '0' || texto === 'voltar' || texto === 'menu') {
      context.newState = BotState.START;
      context.respostas.push(MessagesConstants.VOLTAR_MENU);
      context.respostas.push(mainMenu());
    } else {
      context.respostas.push(MessagesConstants.PEDIDO_CODIGO_NAO_ENCONTRADO(texto));
    }
    return true;
  }

  private _handleNotificationsMenu(): boolean {
    const context = this.context;
    const texto = context.texto;
    if (texto === 'ativar' || texto === 'sim') {
      context.saveMarketingOptIn = true;
      context.marketingOptInValue = true;
      context.newState = BotState.START;
      context.respostas.push(MessagesConstants.NOTIF_ATIVADAS);
      context.respostas.push(mainMenu());
    } else if (texto === 'desativar' || texto === 'nao' || texto === 'não') {
      context.saveMarketingOptIn = true;
      context.marketingOptInValue = false;
      context.newState = BotState.START;
      context.respostas.push(MessagesConstants.NOTIF_DESATIVADAS);
      context.respostas.push(mainMenu());
    } else if (texto === '0' || texto === 'voltar') {
      context.newState = BotState.START;
      context.respostas.push('🔙 ');
      context.respostas.push(mainMenu());
    } else {
      context.respostas.push(MessagesConstants.NOTIF_MENU_PROMPT);
    }
    return true;
  }

  private _handleName(): boolean {
    const context = this.context;
    const validation = validateName(context.texto);
    if (!validation.valid) {
      context.respostas.push(validation.reason === 'bad_word'
        ? MessagesConstants.NOME_INVALIDO_PALAVRAO
        : MessagesConstants.NOME_INVALIDO_GENERICO
      );
      context.newState = BotState.AWAITING_NAME;
      return true;
    }

    const nameFormatted = capitalizeName(context.texto);
    context.customerNameToSave = nameFormatted;
    context.saveCustomerName = true;
    context.newState = BotState.START;

    const lastOrder = context.lastOrder;
    if (lastOrder && Array.isArray(lastOrder.items) && lastOrder.items.length > 0) {
      const lines = context.messages.buildRepeatOrderLines({
        lastOrder,
        products: context.products,
        header: '🔄 *Seu último pedido foi:*',
      });
      context.newState = BotState.REPEAT_ORDER;
      context.respostas.push(MessagesConstants.SAUDACAO_APOS_NOME(nameFormatted) + context.msgWelcome);
      context.respostas.push(lines.join('\n'));
      context.respostas.push(yesNo(MessagesConstants.SAUDACAO_REPEAT_PERGUNTA));
    } else {
      context.respostas.push(MessagesConstants.SAUDACAO_APOS_NOME(nameFormatted) + context.msgWelcome);
      context.respostas.push(mainMenu());
    }
    return true;
  }

  private _handleLastOrderStatus(): boolean {
    const context = this.context;
    const lastOrder = context.lastOrder;
    if (!lastOrder || !lastOrder.code) {
      context.respostas.push('Nenhum pedido encontrado. 😊\n\nDigite *2* para fazer seu primeiro pedido!');
      return true;
    }
    const statusMap: Record<string, string> = {
      received: '📥 Recebido', confirmed: '✅ Confirmado', preparing: '👨‍🍳 Em preparo',
      ready: '✅ Pronto para entrega', delivered: '🚀 Entregue', cancelled: '❌ Cancelado',
    };
    const statusLabel = statusMap[lastOrder.status || ''] || lastOrder.status || '📥 Recebido';
    const { lines } = cartSummary(lastOrder.items || []);
    context.respostas.push('📋 *Seu último pedido:*\n\n🔖 Código: *' + lastOrder.code + '*\n\n' + lines.join('\n') + '\n\n*Total: R$ ' + fmtBRL(lastOrder.total) + '*\n\nStatus: ' + statusLabel);
    return true;
  }

  private _handleNotifInfo(): boolean {
    const context = this.context;
    if (context.marketingOptIn === true) {
      context.respostas.push(MessagesConstants.NOTIF_ATIVAS_INFO);
    } else if (context.marketingOptIn === false) {
      context.respostas.push(MessagesConstants.NOTIF_INATIVAS_INFO);
    } else {
      context.respostas.push(MessagesConstants.NOTIF_NAO_CONFIGURADAS);
    }
    return true;
  }

  private _handleMarketingOptIn(): boolean {
    const context = this.context;
    const texto = context.texto;
    if (texto === 'sim') {
      context.saveMarketingOptIn = true;
      context.marketingOptInValue = true;
      context.newState = BotState.START;
      context.respostas.push(MessagesConstants.OPT_IN_SIM);
    } else if (texto === 'não' || texto === 'nao') {
      context.saveMarketingOptIn = true;
      context.marketingOptInValue = false;
      context.newState = BotState.START;
      context.respostas.push(MessagesConstants.OPT_IN_NAO);
    } else {
      context.respostas.push(MessagesConstants.OPT_IN_REPROMPT);
    }
    return true;
  }
}
