import { BotState } from '../shared/botEngine.constant.ts';
import { MessagesConstants } from '../shared/messages.constant.ts';
import { BaseHandler } from './BaseHandler.ts';

export class MenuShortcutsHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    const context = this.context;
    const texto = context.texto;
    if (context.expectingRawInput) return false;

    if (texto === '1' || texto.includes('cardapio') || texto.includes('cardápio') || texto.includes('menu')) {
      context.newState = BotState.ORDERING_CAT;
      context.respostas.push(context.messages.categoryList('order'));
      return true;
    }

    if (texto === '2' || (texto.includes('pedido') && texto !== 'meu pedido' && !texto.startsWith('meus pedido')) || texto.includes('pedir')) {
      context.newState = BotState.ORDERING_CAT;
      context.respostas.push(context.messages.categoryList('order'));
      return true;
    }

    if ((texto === '3' || texto.includes('reserva') || texto.includes('reservar'))
      && ![BotState.RESERVING as string, BotState.CONFIRMING_RESERVATION as string].includes(context.currentState)) {
      context.newState = BotState.RESERVING;
      context.respostas.push(MessagesConstants.RESERVA_SOLICITAR);
      return true;
    }

    return false;
  }
}
