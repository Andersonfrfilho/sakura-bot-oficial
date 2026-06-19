class ReservationHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (currentState === BotState.RESERVING) {
      return this._handleReserving();
    }
    if (currentState === BotState.CONFIRMING_RESERVATION && texto === 'sim') {
      return this._handleConfirmReservation();
    }
    if (currentState === BotState.CONFIRMING_RESERVATION && (texto === 'não' || texto === 'nao')) {
      newReservationTemp = {};
      newState = BotState.START;
      respostas.push(MessagesConstants.RESERVA_CANCELADA);
      respostas.push(mainMenu());
      return true;
    }
    return false;
  }

  private _handleReserving(): boolean {
    const dateValue = parseDate(texto);
    const timeValue = parseTime(texto);
    const sizeValue = parsePeople(texto);
    const missing: string[] = [];
    if (!dateValue) missing.push('📆 data');
    if (!timeValue) missing.push('🕗 horário');
    if (!sizeValue) missing.push('👥 número de pessoas');

    if (missing.length > 0) {
      respostas.push(MessagesConstants.RESERVA_FALTANDO(missing.join(', ')));
      return true;
    }

    const timeStr = timeValue + ':00';
    const availableTables = restaurantTables
      .filter((table: RestaurantTable) => table.capacity >= sizeValue!)
      .filter((table: RestaurantTable) => !upcomingReservations.some(
        (reservation: UpcomingReservation) => reservation.date === dateValue && reservation.time === timeStr && reservation.table_id === table.id
      ))
      .sort((tableA: RestaurantTable, tableB: RestaurantTable) => tableA.capacity - tableB.capacity);

    if (availableTables.length === 0) {
      respostas.push(MessagesConstants.RESERVA_SEM_MESA(sizeValue!, fmtDate(dateValue!), timeValue!));
    } else {
      const selectedTable = availableTables[0];
      newReservationTemp = { date: dateValue!, time: timeValue!, party_size: sizeValue!, table_id: selectedTable.id, table_number: selectedTable.number };
      newState = BotState.CONFIRMING_RESERVATION;
      respostas.push(confirmBtn(MessagesConstants.RESERVA_RESUMO(fmtDate(dateValue!), timeValue!, sizeValue!, selectedTable.number)));
    }
    return true;
  }

  private _handleConfirmReservation(): boolean {
    const reservationData = newReservationTemp;
    if (!reservationData || !reservationData.date) {
      newState = BotState.START;
      respostas.push(MessagesConstants.RESERVA_DADOS_INVALIDOS);
      return true;
    }

    save_reservation = true;
    finalReservation = {
      tel,
      date: reservationData.date,
      time: reservationData.time!,
      party_size: reservationData.party_size!,
      table_id: reservationData.table_id!,
    };
    newReservationTemp = {};
    newState = BotState.START;

    const estabAddr = config['establishment_address'] || '';
    const mapsLink = estabAddr ? MessagesConstants.RESERVA_MAPS_LINE(estabAddr) : '';
    const addrLine = estabAddr ? MessagesConstants.RESERVA_ADDR_LINE(estabAddr, mapsLink) : '';

    respostas.push(MessagesConstants.RESERVA_CONFIRMADA(
      fmtDate(reservationData.date),
      reservationData.time!,
      reservationData.party_size!,
      reservationData.table_number!,
      addrLine
    ));
    return true;
  }
}
