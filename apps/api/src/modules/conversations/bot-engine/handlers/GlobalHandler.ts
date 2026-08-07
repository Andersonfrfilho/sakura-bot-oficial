import { BotState, CartConstants } from '../shared/botEngine.constant.ts';
import { MessagesConstants } from '../shared/messages.constant.ts';
import { BaseHandler } from './BaseHandler.ts';

export class GlobalHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    const context = this.context;
    if (context.texto !== 'sair' && context.texto !== 'cancelar') return false;
    context.newState = BotState.START;
    context.newCart = CartConstants.EMPTY();
    context.newReservationTemp = {};
    context.respostas.push(MessagesConstants.ATENDIMENTO_ENCERRADO);
    return true;
  }
}
