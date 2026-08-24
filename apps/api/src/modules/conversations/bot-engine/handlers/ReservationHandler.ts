import { confirmBtn, mainMenu } from '../MessageBuilder.ts';
import { BotState } from '../shared/botEngine.constant.ts';
import { MessagesConstants } from '../shared/messages.constant.ts';
import { fmtDate, parseDate, parsePeople, parseTime } from '../shared/formatting.util.ts';
import type { RestaurantTable, UpcomingReservation } from '../shared/botEngine.types.ts';
import { BaseHandler } from './BaseHandler.ts';

export class ReservationHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    const context = this.context;
    if (context.currentState === BotState.RESERVING) {
      return this._handleReserving();
    }
    if (context.currentState === BotState.CONFIRMING_RESERVATION && context.texto === 'sim') {
      return this._handleConfirmReservation();
    }
    if (context.currentState === BotState.CONFIRMING_RESERVATION && (context.texto === 'não' || context.texto === 'nao')) {
      context.newReservationTemp = {};
      context.newState = BotState.START;
      context.respostas.push(MessagesConstants.RESERVA_CANCELADA);
      context.respostas.push(mainMenu());
      return true;
    }
    return false;
  }

  private _handleReserving(): boolean {
    const context = this.context;
    const dateValue = parseDate(context.texto);
    const timeValue = parseTime(context.texto);
    const sizeValue = parsePeople(context.texto);
    const missing: string[] = [];
    if (!dateValue) missing.push('📆 data');
    if (!timeValue) missing.push('🕗 horário');
    if (!sizeValue) missing.push('👥 número de pessoas');

    if (missing.length > 0 || dateValue === null || timeValue === null || sizeValue === null) {
      context.respostas.push(MessagesConstants.RESERVA_FALTANDO(missing.join(', ')));
      return true;
    }

    const timeString = timeValue + ':00';
    const availableTables = context.restaurantTables
      .filter((table: RestaurantTable) => table.capacity >= sizeValue)
      .filter((table: RestaurantTable) => !context.upcomingReservations.some(
        (reservation: UpcomingReservation) => reservation.date === dateValue && reservation.time === timeString && reservation.table_id === table.id
      ))
      .sort((tableA: RestaurantTable, tableB: RestaurantTable) => tableA.capacity - tableB.capacity);

    const selectedTable = availableTables[0];
    if (!selectedTable) {
      context.respostas.push(MessagesConstants.RESERVA_SEM_MESA(sizeValue, fmtDate(dateValue), timeValue));
    } else {
      context.newReservationTemp = {
        date: dateValue,
        time: timeValue,
        party_size: sizeValue,
        table_id: selectedTable.id,
        table_number: selectedTable.number,
      };
      context.newState = BotState.CONFIRMING_RESERVATION;
      context.respostas.push(confirmBtn(MessagesConstants.RESERVA_RESUMO(fmtDate(dateValue), timeValue, sizeValue, selectedTable.number)));
    }
    return true;
  }

  private _handleConfirmReservation(): boolean {
    const context = this.context;
    const reservationData = context.newReservationTemp;
    if (!reservationData || !reservationData.date || !reservationData.time
      || reservationData.party_size === undefined || reservationData.table_id === undefined
      || reservationData.table_number === undefined) {
      context.newState = BotState.START;
      context.respostas.push(MessagesConstants.RESERVA_DADOS_INVALIDOS);
      return true;
    }

    context.saveReservation = true;
    context.finalReservation = {
      tel: context.tel,
      date: reservationData.date,
      time: reservationData.time,
      party_size: reservationData.party_size,
      table_id: reservationData.table_id,
    };
    context.newReservationTemp = {};
    context.newState = BotState.START;

    const establishmentAddress = context.estAddress;
    const mapsLink = establishmentAddress ? MessagesConstants.RESERVA_MAPS_LINE(establishmentAddress) : '';
    const addressLine = establishmentAddress ? MessagesConstants.RESERVA_ADDR_LINE(establishmentAddress, mapsLink) : '';

    context.respostas.push(MessagesConstants.RESERVA_CONFIRMADA(
      fmtDate(reservationData.date),
      reservationData.time,
      reservationData.party_size,
      reservationData.table_number,
      addressLine,
    ));
    return true;
  }
}
