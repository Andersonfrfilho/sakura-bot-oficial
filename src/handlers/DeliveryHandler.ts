class DeliveryHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    // Seleção de tipo de entrega
    if (currentState === BotState.AWAITING_TYPE) {
      let choiceIndex = parseInt(texto) - 1;
      if (isNaN(choiceIndex) || choiceIndex < 0)
        choiceIndex = orderTypes.findIndex((orderType: OrderType) => orderType.name === texto || orderType.label.toLowerCase() === texto.toLowerCase());
      if (choiceIndex >= 0 && choiceIndex < orderTypes.length) {
        const selectedType = orderTypes[choiceIndex];
        newCart.order_type = selectedType.name;
        if (selectedType.name === 'delivery') {
          newState = BotState.AWAITING_ADDRESS;
          respostas.push(MessagesConstants.SOLICITAR_ENDERECO);
        } else {
          newCart.delivery_fee = 0;
          newState = BotState.AWAITING_PAYMENT;
          respostas.push(MessagesConstants.TIPO_CONFIRMADO(selectedType.label));
          respostas.push(paymentList(newCart.split_count));
        }
      } else {
        respostas.push(orderTypeBtn());
      }
      return true;
    }

    // Endereço
    if (currentState === BotState.AWAITING_ADDRESS) {
      await this._handleAddress();
      return true;
    }

    // Número do imóvel (após CEP puro)
    if (currentState === BotState.AWAITING_ADDRESS_NUMBER) {
      await this._handleAddressNumber();
      return true;
    }

    // Oferta de retirada (fora da área)
    if (currentState === BotState.OFFER_PICKUP) {
      if (texto === 'sim') {
        newCart.order_type = 'retirada';
        newCart.delivery_fee = 0;
        newState = BotState.AWAITING_PAYMENT;
        respostas.push(MessagesConstants.RETIRADA_CONFIRMADA);
        respostas.push(paymentList(newCart.split_count));
      } else {
        newState = BotState.AWAITING_ADDRESS;
        respostas.push(MessagesConstants.OUTRO_ENDERECO(config['establishment_city'] || ''));
      }
      return true;
    }

    return false;
  }

  private async _handleAddress(): Promise<void> {
    const estCity = config['establishment_city'] || '';
    const estCityName = estCity.split(',')[0].trim().toLowerCase();

    // Localização compartilhada via WhatsApp
    if (texto === '__location__' && location_lat != null && location_lng != null) {
      const lat = Number(location_lat);
      const lng = Number(location_lng);
      const distance = haversine(estLat, estLng, lat, lng);

      if (distance > maxRadiusKm) {
        newCart.address = 'Localização compartilhada';
        newState = BotState.OFFER_PICKUP;
        respostas.push(offerPickupBtn(MessagesConstants.ENDERECO_FORA_AREA(maxRadiusKm)));
        return;
      }

      let routeKm = distance;
      let routeMin = Math.round(distance * 3);
      try {
        const osrmRaw = await ((this as unknown) as { helpers: { httpRequest: (opts: unknown) => Promise<unknown> } }).helpers.httpRequest({
          method: 'GET',
          url: 'https://router.project-osrm.org/route/v1/driving/' + estLng + ',' + estLat + ';' + lng + ',' + lat + '?overview=false',
          headers: { 'User-Agent': 'SakuraBot/1.0' },
        });
        const osrmData: OsrmResponse = typeof osrmRaw === 'string' ? JSON.parse(osrmRaw) : osrmRaw as OsrmResponse;
        if (osrmData.routes && osrmData.routes[0]) {
          routeKm = osrmData.routes[0].distance / 1000;
          routeMin = Math.round(osrmData.routes[0].duration / 60);
        }
      } catch(error) {}

      let addressLabel = 'Localização compartilhada';
      try {
        const reverseRaw = await ((this as unknown) as { helpers: { httpRequest: (opts: unknown) => Promise<unknown> } }).helpers.httpRequest({
          method: 'GET',
          url: 'https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&accept-language=pt-BR',
          headers: { 'User-Agent': 'SakuraBot/1.0' },
        });
        const reverseData: NominatimReverseResult = typeof reverseRaw === 'string' ? JSON.parse(reverseRaw) : reverseRaw as NominatimReverseResult;
        if (reverseData.address) {
          const addr = reverseData.address;
          const parts = [addr.road, addr.house_number, addr.suburb || addr.neighbourhood, addr.city || addr.town || addr.village, addr.state_code || addr.state].filter(Boolean);
          if (parts.length > 0) addressLabel = parts.join(', ');
        }
      } catch(error) {}

      const { total: cartSubtotal } = cartSummary(newCart.items);
      const calcFee = calcDeliveryFee(routeKm, routeMin, cartSubtotal);
      newCart.address = addressLabel;
      newCart.delivery_fee = calcFee;
      const etaLine = routeMin > 0
        ? (calcFee === 0
            ? MessagesConstants.ETA_LINE_GRATIS(routeMin, routeKm.toFixed(1))
            : MessagesConstants.ETA_LINE(fmtBRL(calcFee), routeMin, routeKm.toFixed(1)))
        : '';
      newState = BotState.AWAITING_COMPLEMENT;
      respostas.push(locationMsg(lat, lng, 'Endereço de entrega', addressLabel));
      respostas.push(MessagesConstants.LOCALIZACAO_RECEBIDA(addressLabel, etaLine));
      return;
    }

    // Endereço em texto / CEP
    const input = texto.trim();
    const cepDigits = input.replace(/\D/g, '');
    let addressToGeocode = input;
    let cepInfo: CepResponse | null = null;

    if (cepDigits.length === 8) {
      try {
        const cepRaw = await ((this as unknown) as { helpers: { httpRequest: (opts: unknown) => Promise<unknown> } }).helpers.httpRequest({
          method: 'GET',
          url: 'https://viacep.com.br/ws/' + cepDigits.substring(0, 5) + '-' + cepDigits.substring(5) + '/json/',
          headers: { 'User-Agent': 'SakuraBot/1.0' },
        });
        const cepData: CepResponse = typeof cepRaw === 'string' ? JSON.parse(cepRaw) : cepRaw as CepResponse;
        if (!cepData.erro) cepInfo = cepData;
      } catch(error) {}

      if (/^\d{5}-?\d{3}$/.test(input.trim()) && cepInfo) {
        const streetLabel = [cepInfo.logradouro, cepInfo.bairro, cepInfo.localidade, cepInfo.uf].filter(Boolean).join(', ');
        newCart.address_street_temp = JSON.stringify({
          logradouro: cepInfo.logradouro || '',
          bairro: cepInfo.bairro || '',
          localidade: cepInfo.localidade || '',
          uf: cepInfo.uf || '',
          cep: cepInfo.cep || '',
        });
        newState = BotState.AWAITING_ADDRESS_NUMBER;
        respostas.push(MessagesConstants.CEP_ENCONTRADO(cepInfo.cep, streetLabel));
        _earlyResponse = buildPayload();
        return;
      }

      if (cepInfo) {
        const parts = [cepInfo.logradouro, cepInfo.bairro, cepInfo.localidade, cepInfo.uf].filter(Boolean);
        if (parts.length > 0) addressToGeocode = parts.join(', ');
      }
    }

    const streetAndNumMatch = input.match(/^(.+?\s+\d+)/);
    const streetAndNum = streetAndNumMatch ? streetAndNumMatch[1].trim() : input;

    let geoResult: NominatimResult | null = null;
    try {
      const nominatimRaw1 = await ((this as unknown) as { helpers: { httpRequest: (opts: unknown) => Promise<unknown> } }).helpers.httpRequest({
        method: 'GET',
        url: 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(addressToGeocode + ', Brasil') + '&format=json&limit=1&countrycodes=br',
        headers: { 'User-Agent': 'SakuraBot/1.0' },
      });
      const nominatimData1: NominatimResult[] = typeof nominatimRaw1 === 'string' ? JSON.parse(nominatimRaw1) : nominatimRaw1 as NominatimResult[];
      if (Array.isArray(nominatimData1) && nominatimData1.length > 0) geoResult = nominatimData1[0];
    } catch(error) {}

    if (!geoResult && estCity && !addressToGeocode.toLowerCase().includes(estCityName)) {
      try {
        const withCity = addressToGeocode + ', ' + estCity;
        const nominatimRaw2 = await ((this as unknown) as { helpers: { httpRequest: (opts: unknown) => Promise<unknown> } }).helpers.httpRequest({
          method: 'GET',
          url: 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(withCity + ', Brasil') + '&format=json&limit=1&countrycodes=br',
          headers: { 'User-Agent': 'SakuraBot/1.0' },
        });
        const nominatimData2: NominatimResult[] = typeof nominatimRaw2 === 'string' ? JSON.parse(nominatimRaw2) : nominatimRaw2 as NominatimResult[];
        if (Array.isArray(nominatimData2) && nominatimData2.length > 0) { geoResult = nominatimData2[0]; addressToGeocode = withCity; }
      } catch(error) {}
    }

    if (!geoResult && estCity && streetAndNum !== addressToGeocode) {
      try {
        const stripped = streetAndNum + ', ' + estCity;
        const nominatimRaw3 = await ((this as unknown) as { helpers: { httpRequest: (opts: unknown) => Promise<unknown> } }).helpers.httpRequest({
          method: 'GET',
          url: 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(stripped + ', Brasil') + '&format=json&limit=1&countrycodes=br',
          headers: { 'User-Agent': 'SakuraBot/1.0' },
        });
        const nominatimData3: NominatimResult[] = typeof nominatimRaw3 === 'string' ? JSON.parse(nominatimRaw3) : nominatimRaw3 as NominatimResult[];
        if (Array.isArray(nominatimData3) && nominatimData3.length > 0) { geoResult = nominatimData3[0]; addressToGeocode = stripped; }
      } catch(error) {}
    }

    if (!geoResult) {
      const hint = cepInfo
        ? MessagesConstants.ENDERECO_HINT_CEP(cepInfo.cep, addressToGeocode)
        : MessagesConstants.ENDERECO_HINT(estCity);
      respostas.push(MessagesConstants.ENDERECO_NAO_ENCONTRADO(hint));
      return;
    }

    await this._applyGeoResult(geoResult, addressToGeocode);
  }

  private async _handleAddressNumber(): Promise<void> {
    const numberInput = texto.trim();
    let streetInfo: Record<string, string> = {};
    try { streetInfo = JSON.parse(newCart.address_street_temp || '{}'); } catch(error) {}

    if (!streetInfo['localidade']) {
      newState = BotState.AWAITING_ADDRESS;
      respostas.push(MessagesConstants.ENDERECO_INVALIDO_RETRY(config['establishment_city'] || ''));
      return;
    }

    const numLabel = numberInput === 's/n' ? 'S/N' : numberInput;
    const fullAddress = [streetInfo['logradouro'], numLabel, streetInfo['bairro'], streetInfo['localidade'], streetInfo['uf']].filter(Boolean).join(', ');
    newCart.address_street_temp = null;

    let geoResult: NominatimResult | null = null;
    try {
      const nominatimRaw1 = await ((this as unknown) as { helpers: { httpRequest: (opts: unknown) => Promise<unknown> } }).helpers.httpRequest({
        method: 'GET',
        url: 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(fullAddress + ', Brasil') + '&format=json&limit=1&countrycodes=br',
        headers: { 'User-Agent': 'SakuraBot/1.0' },
      });
      const nominatimData1: NominatimResult[] = typeof nominatimRaw1 === 'string' ? JSON.parse(nominatimRaw1) : nominatimRaw1 as NominatimResult[];
      if (Array.isArray(nominatimData1) && nominatimData1.length > 0) geoResult = nominatimData1[0];
    } catch(error) {}

    if (!geoResult) {
      const { total: cartSubtotal } = cartSummary(newCart.items);
      const fee = calcDeliveryFee(0, 0, cartSubtotal);
      const mapsLink = 'https://maps.google.com/?q=' + encodeURIComponent(fullAddress);
      newCart.address = fullAddress;
      newCart.delivery_fee = fee;
      const feeMsg = fee === 0 ? MessagesConstants.FRETE_GRATIS : MessagesConstants.TAXA_ENTREGA(fmtBRL(fee));
      newState = BotState.AWAITING_COMPLEMENT;
      respostas.push(MessagesConstants.ENDERECO_CONFIRMADO_CEP(fullAddress, mapsLink, feeMsg));
      return;
    }

    await this._applyGeoResult(geoResult, fullAddress);
  }

  private async _applyGeoResult(geoResult: NominatimResult, addressLabel: string): Promise<void> {
    const lat = parseFloat(geoResult.lat);
    const lng = parseFloat(geoResult.lon);
    const distance = haversine(estLat, estLng, lat, lng);

    if (distance > maxRadiusKm) {
      newCart.address = addressLabel;
      newState = BotState.OFFER_PICKUP;
      respostas.push(offerPickupBtn(MessagesConstants.ENDERECO_FORA_AREA(maxRadiusKm)));
      return;
    }

    let routeKm = distance;
    let routeMin = Math.round(distance * 3);
    try {
      const osrmRaw = await ((this as unknown) as { helpers: { httpRequest: (opts: unknown) => Promise<unknown> } }).helpers.httpRequest({
        method: 'GET',
        url: 'https://router.project-osrm.org/route/v1/driving/' + estLng + ',' + estLat + ';' + lng + ',' + lat + '?overview=false',
        headers: { 'User-Agent': 'SakuraBot/1.0' },
      });
      const osrmData: OsrmResponse = typeof osrmRaw === 'string' ? JSON.parse(osrmRaw) : osrmRaw as OsrmResponse;
      if (osrmData.routes && osrmData.routes[0]) {
        routeKm = osrmData.routes[0].distance / 1000;
        routeMin = Math.round(osrmData.routes[0].duration / 60);
      }
    } catch(error) {}

    const { total: cartSubtotal } = cartSummary(newCart.items);
    const calcFee = calcDeliveryFee(routeKm, routeMin, cartSubtotal);
    newCart.address = addressLabel;
    newCart.delivery_fee = calcFee;
    const etaLine = routeMin > 0
      ? (calcFee === 0
          ? MessagesConstants.ETA_LINE_GRATIS(routeMin, routeKm.toFixed(1))
          : MessagesConstants.ETA_LINE(fmtBRL(calcFee), routeMin, routeKm.toFixed(1)))
      : '';
    newState = BotState.AWAITING_COMPLEMENT;
    respostas.push(locationMsg(lat, lng, 'Endereço de entrega', addressLabel));
    respostas.push(MessagesConstants.ENDERECO_ENCONTRADO(addressLabel, etaLine));
  }
}
