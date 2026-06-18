// ═══════════════════════════════════════════════════════════════
// RESERVATION — Fluxo de reserva de mesa
//   reserving · confirming_reservation
// ═══════════════════════════════════════════════════════════════
} else if (currentState === 'reserving') {
  const dateVal = parseDate(texto);
  const timeVal = parseTime(texto);
  const sizeVal = parsePeople(texto);
  const missing = [];
  if (!dateVal) missing.push('📆 data');
  if (!timeVal) missing.push('🕗 horário');
  if (!sizeVal) missing.push('👥 número de pessoas');
  if (missing.length > 0) {
    respostas.push('⚠️ Faltou informar: ' + missing.join(', ') + '.\n\nEx: _Sábado às 20h para 4 pessoas_\nOu: _12/06 às 20h, 4 pessoas_');
  } else {
    const timeStr = timeVal + ':00';
    const available = restaurantTables
      .filter(t => t.capacity >= sizeVal)
      .filter(t => !upcomingReservations.some(r => r.date === dateVal && r.time === timeStr && r.table_id === t.id))
      .sort((a, b) => a.capacity - b.capacity);
    if (available.length === 0) {
      respostas.push('😞 Não há mesa disponível para *' + sizeVal + ' pessoas* em *' + fmtDate(dateVal) + '* às *' + timeVal + '*.\n\nEscolha outra data ou horário:');
    } else {
      const table = available[0];
      newReservationTemp = { date: dateVal, time: timeVal, party_size: sizeVal, table_id: table.id, table_number: table.number };
      newState = 'confirming_reservation';
      respostas.push(confirmBtn(
        '📅 *Resumo da reserva:*\n\n' +
        '📆 Data: *' + fmtDate(dateVal) + '*\n' +
        '🕗 Horário: *' + timeVal + '*\n' +
        '👥 Pessoas: *' + sizeVal + '*\n' +
        '🪑 Mesa: *' + table.number + '*\n\nConfirma a reserva?'
      ));
    }
  }

} else if (currentState === 'confirming_reservation' && texto === 'sim') {
  const res = newReservationTemp;
  if (!res || !res.date) {
    newState = 'start';
    respostas.push('⚠️ Não encontrei os dados da reserva. Digite *3* para tentar novamente.');
  } else {
    save_reservation = true;
    finalReservation = { tel, date: res.date, time: res.time, party_size: res.party_size, table_id: res.table_id };
    newReservationTemp = {};
    newState = 'start';
    const estabAddr = config['establishment_address'] || '';
    const mapsLink = estabAddr ? '\n🗺️ https://maps.google.com/?q=' + encodeURIComponent(estabAddr) : '';
    const addrLine = estabAddr ? '\n\n📍 *Localização:* ' + estabAddr + mapsLink : '';
    respostas.push('✅ *Reserva confirmada!*\n\n📆 ' + fmtDate(res.date) + ' às ' + res.time + '\n👥 ' + res.party_size + ' pessoas\n🪑 Mesa ' + res.table_number + addrLine + '\n\nTe esperamos! 🌸');
  }

} else if (currentState === 'confirming_reservation' && (texto === 'não' || texto === 'nao')) {
  newReservationTemp = {};
  newState = 'start';
  respostas.push('Reserva cancelada. '); respostas.push(mainMenu());
