// ═══════════════════════════════════════════════════════════════
// DELIVERY — Fluxo de entrega
//   awaiting_type · awaiting_address · address_number · complement · offer_pickup
// ═══════════════════════════════════════════════════════════════
} else if (currentState === 'awaiting_type') {
  let choice = parseInt(texto) - 1;
  if (isNaN(choice) || choice < 0) choice = orderTypes.findIndex(t => t.name === texto || t.label.toLowerCase() === texto.toLowerCase());
  if (choice >= 0 && choice < orderTypes.length) {
    const type = orderTypes[choice];
    newCart.order_type = type.name;
    if (type.name === 'delivery') {
      newState = 'awaiting_address';
      respostas.push('📍 *Qual é o seu endereço de entrega?*\n\nEx: _Rua das Flores, 123, Centro, Cidade, SP_\nOu informe o *CEP* (ex: _14403-772_)\nOu compartilhe sua 📍 *localização* pelo WhatsApp');
    } else {
      newCart.delivery_fee = 0;
      newState = 'awaiting_payment';
      respostas.push('✅ *' + type.label + ' confirmada!*'); respostas.push(paymentList(newCart.split_count));
    }
  } else {
    respostas.push(orderTypeBtn());
  }

} else if (currentState === 'awaiting_address') {
  const estCity = config['establishment_city'] || '';
  const estCityName = estCity.split(',')[0].trim().toLowerCase();

  // ── Localização compartilhada via WhatsApp ───────────────────────────────
  if (texto === '__location__' && location_lat != null && location_lng != null) {
    const lat = Number(location_lat);
    const lng = Number(location_lng);
    const distance = haversine(estLat, estLng, lat, lng);
    const mapsLink = 'https://maps.google.com/?q=' + lat + ',' + lng;

    if (distance > maxRadiusKm) {
      newCart.address = 'Localização compartilhada';
      newState = 'offer_pickup';
      respostas.push(offerPickupBtn('😞 Seu endereço está fora da nossa área de entrega (máx. ' + maxRadiusKm + ' km).\n\nPodemos oferecer retirada no local. Deseja?'));
    } else {
      let routeKm = distance;
      let routeMin = Math.round(distance * 3);
      try {
        const osrm = await this.helpers.httpRequest({
          method: 'GET',
          url: 'https://router.project-osrm.org/route/v1/driving/' + estLng + ',' + estLat + ';' + lng + ',' + lat + '?overview=false',
          headers: { 'User-Agent': 'SakuraBot/1.0' }
        });
        const od = typeof osrm === 'string' ? JSON.parse(osrm) : osrm;
        if (od.routes && od.routes[0]) {
          routeKm = od.routes[0].distance / 1000;
          routeMin = Math.round(od.routes[0].duration / 60);
        }
      } catch(e) {}

      let addressLabel = 'Localização compartilhada';
      try {
        const rev = await this.helpers.httpRequest({
          method: 'GET',
          url: 'https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&accept-language=pt-BR',
          headers: { 'User-Agent': 'SakuraBot/1.0' }
        });
        const rd = typeof rev === 'string' ? JSON.parse(rev) : rev;
        if (rd.address) {
          const a = rd.address;
          const parts = [a.road, a.house_number, a.suburb || a.neighbourhood, a.city || a.town || a.village, a.state_code || a.state].filter(Boolean);
          if (parts.length > 0) addressLabel = parts.join(', ');
        }
      } catch(e) {}

      const { total: _subtotal } = cartSummary(newCart.items);
      const calcFee = calcDeliveryFee(routeKm, routeMin, _subtotal);
      newCart.address = addressLabel;
      newCart.delivery_fee = calcFee;
      const etaLine = routeMin > 0 ? '\n🛵 ' + (calcFee === 0 ? '🎉 *Frete GRÁTIS!*' : 'Taxa: R$ ' + fmtBRL(calcFee)) + ' · ~' + routeMin + ' min (' + routeKm.toFixed(1) + ' km)' : '';
      newState = 'awaiting_complement';
      respostas.push(locationMsg(lat, lng, 'Endereço de entrega', addressLabel));
      respostas.push('📍 *Localização recebida!*\n_' + addressLabel + '_' + etaLine + '\n\nAdicione o complemento (ex: _Apto 42, Bloco B_) ou *ok* para confirmar.');
    }

  } else {
    // ── Endereço em texto / CEP ──────────────────────────────────────────────
    const input = texto.trim();
    const cepDigits = input.replace(/\D/g, '');
    let addressToGeocode = input;
    let cepInfo = null;

    if (cepDigits.length === 8) {
      try {
        const cepResp = await this.helpers.httpRequest({
          method: 'GET',
          url: 'https://viacep.com.br/ws/' + cepDigits.substring(0,5) + '-' + cepDigits.substring(5) + '/json/',
          headers: { 'User-Agent': 'SakuraBot/1.0' }
        });
        const cep = typeof cepResp === 'string' ? JSON.parse(cepResp) : cepResp;
        if (!cep.erro) cepInfo = cep;
      } catch(e) {}

      // CEP puro (sem número) → pedir o número do imóvel
      if (/^\d{5}-?\d{3}$/.test(input.trim()) && cepInfo) {
        const streetLabel = [cepInfo.logradouro, cepInfo.bairro, cepInfo.localidade, cepInfo.uf].filter(Boolean).join(', ');
        newCart.address_street_temp = JSON.stringify({
          logradouro: cepInfo.logradouro || '',
          bairro: cepInfo.bairro || '',
          localidade: cepInfo.localidade || '',
          uf: cepInfo.uf || '',
          cep: cepInfo.cep || ''
        });
        newState = 'awaiting_address_number';
        respostas.push('📮 CEP *' + cepInfo.cep + '* encontrado:\n_' + streetLabel + '_\n\nQual o *número* do imóvel?\n\nEx: _123_\nOu _s/n_ se não tiver número');
        return [{ json: { tel, instancia, respostas, state: newState, cart: newCart, reservation_temp: newReservationTemp, save_order, order: finalOrder, save_reservation, reservation: finalReservation, save_customer_name, customer_name_to_save: customerNameToSave, save_marketing_opt_in, marketing_opt_in_value, kitchen_phone: config['kitchen_phone'] || '', create_chatwoot_conversation, chatwoot_customer_name: chatwootCustomerName } }];
      }

      if (cepInfo) {
        const parts = [cepInfo.logradouro, cepInfo.bairro, cepInfo.localidade, cepInfo.uf].filter(Boolean);
        if (parts.length > 0) addressToGeocode = parts.join(', ');
      }
    }

    const streetAndNumMatch = input.match(/^(.+?\s+\d+)/);
    const streetAndNum = streetAndNumMatch ? streetAndNumMatch[1].trim() : input;

    let geoResult = null;
    try {
      const r1 = await this.helpers.httpRequest({
        method: 'GET',
        url: 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(addressToGeocode + ', Brasil') + '&format=json&limit=1&countrycodes=br',
        headers: { 'User-Agent': 'SakuraBot/1.0' }
      });
      const d1 = typeof r1 === 'string' ? JSON.parse(r1) : r1;
      if (Array.isArray(d1) && d1.length > 0) geoResult = d1[0];
    } catch(e) {}

    if (!geoResult && estCity && !addressToGeocode.toLowerCase().includes(estCityName)) {
      try {
        const withCity = addressToGeocode + ', ' + estCity;
        const r2 = await this.helpers.httpRequest({
          method: 'GET',
          url: 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(withCity + ', Brasil') + '&format=json&limit=1&countrycodes=br',
          headers: { 'User-Agent': 'SakuraBot/1.0' }
        });
        const d2 = typeof r2 === 'string' ? JSON.parse(r2) : r2;
        if (Array.isArray(d2) && d2.length > 0) {
          geoResult = d2[0];
          addressToGeocode = withCity;
        }
      } catch(e) {}
    }

    if (!geoResult && estCity && streetAndNum !== addressToGeocode) {
      try {
        const stripped = streetAndNum + ', ' + estCity;
        const r3 = await this.helpers.httpRequest({
          method: 'GET',
          url: 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(stripped + ', Brasil') + '&format=json&limit=1&countrycodes=br',
          headers: { 'User-Agent': 'SakuraBot/1.0' }
        });
        const d3 = typeof r3 === 'string' ? JSON.parse(r3) : r3;
        if (Array.isArray(d3) && d3.length > 0) {
          geoResult = d3[0];
          addressToGeocode = stripped;
        }
      } catch(e) {}
    }

    if (!geoResult) {
      let hint = '\n\nEx: _Rua das Flores, 123' + (estCity ? ', ' + estCity : '') + '_\nOu informe o *CEP* (ex: _14403-772_)\nOu compartilhe sua 📍 *localização* pelo WhatsApp';
      if (cepInfo) {
        hint = '\n\nCEP *' + cepInfo.cep + '* encontrado:\n_' + addressToGeocode + '_\n\nInforme também o número do imóvel.';
      }
      respostas.push('⚠️ Não consegui localizar esse endereço.' + hint);
    } else {
      const lat = parseFloat(geoResult.lat);
      const lng = parseFloat(geoResult.lon);
      const distance = haversine(estLat, estLng, lat, lng);
      const mapsLink = 'https://maps.google.com/?q=' + lat + ',' + lng;
      if (distance > maxRadiusKm) {
        newCart.address = addressToGeocode;
        newState = 'offer_pickup';
        respostas.push(offerPickupBtn('😞 Seu endereço está fora da nossa área de entrega (máx. ' + maxRadiusKm + ' km).\n\nPodemos oferecer retirada no local. Deseja?'));
      } else {
        let routeKm = distance;
        let routeMin = Math.round(distance * 3);
        try {
          const osrm = await this.helpers.httpRequest({
            method: 'GET',
            url: 'https://router.project-osrm.org/route/v1/driving/' + estLng + ',' + estLat + ';' + lng + ',' + lat + '?overview=false',
            headers: { 'User-Agent': 'SakuraBot/1.0' }
          });
          const od = typeof osrm === 'string' ? JSON.parse(osrm) : osrm;
          if (od.routes && od.routes[0]) {
            routeKm = od.routes[0].distance / 1000;
            routeMin = Math.round(od.routes[0].duration / 60);
          }
        } catch(e) {}
        const { total: _subtotal } = cartSummary(newCart.items);
        const calcFee = calcDeliveryFee(routeKm, routeMin, _subtotal);
        newCart.address = addressToGeocode;
        newCart.delivery_fee = calcFee;
        const etaLine = routeMin > 0 ? '\n🛵 ' + (calcFee === 0 ? '🎉 *Frete GRÁTIS!*' : 'Taxa: R$ ' + fmtBRL(calcFee)) + ' · ~' + routeMin + ' min (' + routeKm.toFixed(1) + ' km)' : '';
        newState = 'awaiting_complement';
        respostas.push(locationMsg(lat, lng, 'Endereço de entrega', addressToGeocode));
        respostas.push('📍 *Endereço encontrado:*\n_' + addressToGeocode + '_' + etaLine + '\n\nAdicione o complemento (ex: _Apto 42, Bloco B_) ou *ok* para confirmar.');
      }
    }
  }

} else if (currentState === 'awaiting_address_number') {
  const num = texto.trim();
  let streetInfo = {};
  try { streetInfo = JSON.parse(newCart.address_street_temp || '{}'); } catch(e) {}

  if (!streetInfo.localidade) {
    newState = 'awaiting_address';
    respostas.push('⚠️ Não encontrei os dados do endereço. Por favor informe novamente:\n\nEx: _Rua das Flores, 123' + (config['establishment_city'] ? ', ' + config['establishment_city'] : '') + '_\nOu compartilhe sua 📍 *localização*');
  } else {
    const numLabel = num === 's/n' ? 'S/N' : num;
    const fullAddress = [streetInfo.logradouro, numLabel, streetInfo.bairro, streetInfo.localidade, streetInfo.uf].filter(Boolean).join(', ');
    newCart.address_street_temp = null;

    let geoResult = null;
    try {
      const r1 = await this.helpers.httpRequest({
        method: 'GET',
        url: 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(fullAddress + ', Brasil') + '&format=json&limit=1&countrycodes=br',
        headers: { 'User-Agent': 'SakuraBot/1.0' }
      });
      const d1 = typeof r1 === 'string' ? JSON.parse(r1) : r1;
      if (Array.isArray(d1) && d1.length > 0) geoResult = d1[0];
    } catch(e) {}

    const estCity = config['establishment_city'] || '';
    const estCityName = estCity.split(',')[0].trim().toLowerCase();
    const cepCity = (streetInfo.localidade || '').toLowerCase();

    if (!geoResult) {
      // CEP já foi validado pelo ViaCEP — aceitar o endereço mesmo sem geocoding
      const mapsLink = 'https://maps.google.com/?q=' + encodeURIComponent(fullAddress);
      const { total: _subtotal } = cartSummary(newCart.items);
      const fee = calcDeliveryFee(0, 0, _subtotal);
      newCart.address = fullAddress;
      newCart.delivery_fee = fee;
      const feeMsg = fee === 0 ? '🎉 *Frete GRÁTIS!*' : '🛵 Taxa de entrega: R$ ' + fmtBRL(fee);
      newState = 'awaiting_complement';
      respostas.push('📍 *Endereço confirmado:*\n_' + fullAddress + '_\n🗺️ ' + mapsLink + '\n' + feeMsg + '\n\nAdicione o complemento (ex: _Apto 42, Bloco B_) ou *ok* para confirmar.');
    } else {
      const lat = parseFloat(geoResult.lat);
      const lng = parseFloat(geoResult.lon);
      const distance = haversine(estLat, estLng, lat, lng);
      const mapsLink = 'https://maps.google.com/?q=' + lat + ',' + lng;
      if (distance > maxRadiusKm) {
        newCart.address = fullAddress;
        newState = 'offer_pickup';
        respostas.push(offerPickupBtn('😞 Seu endereço está fora da nossa área de entrega (máx. ' + maxRadiusKm + ' km).\n\nPodemos oferecer retirada no local. Deseja?'));
      } else {
        let routeKm = distance;
        let routeMin = Math.round(distance * 3);
        try {
          const osrm = await this.helpers.httpRequest({
            method: 'GET',
            url: 'https://router.project-osrm.org/route/v1/driving/' + estLng + ',' + estLat + ';' + lng + ',' + lat + '?overview=false',
            headers: { 'User-Agent': 'SakuraBot/1.0' }
          });
          const od = typeof osrm === 'string' ? JSON.parse(osrm) : osrm;
          if (od.routes && od.routes[0]) {
            routeKm = od.routes[0].distance / 1000;
            routeMin = Math.round(od.routes[0].duration / 60);
          }
        } catch(e) {}
        const { total: _subtotal } = cartSummary(newCart.items);
        const calcFee = calcDeliveryFee(routeKm, routeMin, _subtotal);
        newCart.address = fullAddress;
        newCart.delivery_fee = calcFee;
        const etaLine = routeMin > 0 ? '\n🛵 ' + (calcFee === 0 ? '🎉 *Frete GRÁTIS!*' : 'Taxa: R$ ' + fmtBRL(calcFee)) + ' · ~' + routeMin + ' min (' + routeKm.toFixed(1) + ' km)' : '';
        newState = 'awaiting_complement';
        respostas.push(locationMsg(lat, lng, 'Endereço de entrega', fullAddress));
        respostas.push('📍 *Endereço confirmado:*\n_' + fullAddress + '_' + etaLine + '\n\nAdicione o complemento (ex: _Apto 42, Bloco B_) ou *ok* para confirmar.');
      }
    }
  }

} else if (currentState === 'offer_pickup') {
  if (texto === 'sim') {
    newCart.order_type = 'retirada';
    newCart.delivery_fee = 0;
    newState = 'awaiting_payment';
    respostas.push('✅ *Retirada no local!*'); respostas.push(paymentList(newCart.split_count));
  } else {
    newState = 'awaiting_address';
    respostas.push('📍 *Informe outro endereço:*\n\nEx: _Rua das Flores, 123, Centro, ' + (config['establishment_city'] || 'Cidade, SP') + '_\nOu informe o *CEP*.');
  }
