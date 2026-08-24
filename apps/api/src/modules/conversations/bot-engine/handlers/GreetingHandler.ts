import { mainMenu, yesNo } from '../MessageBuilder.ts';
import { BotState, CartConstants, GREETINGS } from '../shared/botEngine.constant.ts';
import { MessagesConstants } from '../shared/messages.constant.ts';
import { BaseHandler } from './BaseHandler.ts';

export class GreetingHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    const context = this.context;
    const texto = context.texto;
    if (!GREETINGS.includes(texto) && !texto.includes('oi!') && !texto.includes('ola!')) return false;

    context.newState = BotState.START;
    context.newCart = CartConstants.EMPTY();

    if (!context.customerName) {
      context.newState = BotState.AWAITING_NAME;
      context.respostas.push(MessagesConstants.BOAS_VINDAS_NOME(context.estName));
    } else {
      if (!context.customerNameFromDatabase && context.pushNameFormatted) {
        context.customerNameToSave = context.pushNameFormatted;
        context.saveCustomerName = true;
      }
      const lastOrder = context.lastOrder;
      if (lastOrder && Array.isArray(lastOrder.items) && lastOrder.items.length > 0) {
        const lines = context.messages.buildRepeatOrderLines({
          lastOrder,
          products: context.products,
          header: MessagesConstants.SAUDACAO_REPEAT(context.customerName),
        });
        context.newState = BotState.REPEAT_ORDER;
        context.respostas.push(context.msgWelcome);
        context.respostas.push(lines.join('\n'));
        context.respostas.push(yesNo(MessagesConstants.SAUDACAO_REPEAT_PERGUNTA));
      } else {
        context.respostas.push(context.msgWelcome);
        context.respostas.push(mainMenu());
      }
    }
    return true;
  }
}
