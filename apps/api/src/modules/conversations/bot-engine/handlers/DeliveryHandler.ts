import { locationMsg, offerPickupBtn } from '../MessageBuilder.ts';
import { BotState } from '../shared/botEngine.constant.ts';
import { MessagesConstants } from '../shared/messages.constant.ts';
import { cartSummary, fmtBRL, haversine } from '../shared/formatting.util.ts';
import type { CepResponse, OrderType } from '../shared/botEngine.types.ts';
import { BaseHandler } from './BaseHandler.ts';

export class DeliveryHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    const context = this.context;
    const texto = context.texto;

    if (context.currentState === BotState.AWAITING_TYPE) {
      let choiceIndex = parseInt(texto) - 1;
      if (isNaN(choiceIndex) || choiceIndex < 0) {
        choiceIndex = context.orderTypes.findIndex((orderType: OrderType) =>
          orderType.name === texto || orderType.label.toLowerCase() === texto.toLowerCase());
      }
      const selectedType = context.orderTypes[choiceIndex];
      if (choiceIndex >= 0 && choiceIndex < context.orderTypes.length && selectedType) {
        context.newCart.order_type = selectedType.name;
        if (selectedType.name === 'delivery') {
          context.newState = BotState.AWAITING_ADDRESS;
          context.respostas.push(MessagesConstants.SOLICITAR_ENDERECO);
        } else {
          context.newCart.delivery_fee = 0;
          context.newState = BotState.AWAITING_PAYMENT;
          context.respostas.push(MessagesConstants.TIPO_CONFIRMADO(selectedType.label));
          context.respostas.push(context.messages.paymentList(context.newCart.split_count));
        }
      } else {
        context.respostas.push(context.messages.orderTypeBtn());
      }
      return true;
    }

    if (context.currentState === BotState.AWAITING_ADDRESS) {
      await this._handleAddress();
      return true;
    }

    if (context.currentState === BotState.AWAITING_ADDRESS_NUMBER) {
      await this._handleAddressNumber();
      return true;
    }

    if (context.currentState === BotState.OFFER_PICKUP) {
      if (texto === 'sim') {
        context.newCart.order_type = 'retirada';
        context.newCart.delivery_fee = 0;
        context.newState = BotState.AWAITING_PAYMENT;
        context.respostas.push(MessagesConstants.RETIRADA_CONFIRMADA);
        context.respostas.push(context.messages.paymentList(context.newCart.split_count));
      } else {
        context.newState = BotState.AWAITING_ADDRESS;
        context.respostas.push(MessagesConstants.OUTRO_ENDERECO(context.estCity || ''));
      }
      return true;
    }

    return false;
  }

  private _coordsConfigured(): boolean {
    return this.context.estLat !== 0 || this.context.estLng !== 0;
  }

  private _buildEtaLine(calcFee: number, routeMin: number, routeKm: number): string {
    if (routeMin <= 0) return '';
    return calcFee === 0
      ? MessagesConstants.ETA_LINE_GRATIS(routeMin, routeKm.toFixed(1))
      : MessagesConstants.ETA_LINE(fmtBRL(calcFee), routeMin, routeKm.toFixed(1));
  }

  private async _applyRoute(lat: number, lng: number, addressLabel: string): Promise<void> {
    const context = this.context;
    const distance = haversine(context.estLat, context.estLng, lat, lng);

    if (this._coordsConfigured() && distance > context.maxRadiusKm) {
      context.newCart.address = addressLabel;
      context.newState = BotState.OFFER_PICKUP;
      context.respostas.push(offerPickupBtn(MessagesConstants.ENDERECO_FORA_AREA(context.maxRadiusKm)));
      return;
    }

    let routeKm = 0;
    let routeMin = 0;
    if (this._coordsConfigured()) {
      const route = await context.routingProvider.route(context.estLat, context.estLng, lat, lng);
      if (route) { routeKm = route.km; routeMin = route.min; }
    }

    const { total: cartSubtotal } = cartSummary(context.newCart.items);
    const calcFee = context.calcDeliveryFee(routeKm, routeMin, cartSubtotal);
    context.newCart.address = addressLabel;
    context.newCart.delivery_fee = calcFee;
    context.newState = BotState.AWAITING_COMPLEMENT;
    context.respostas.push(locationMsg(lat, lng, 'Endereço de entrega', addressLabel));
    context.respostas.push(MessagesConstants.ENDERECO_ENCONTRADO(addressLabel, this._buildEtaLine(calcFee, routeMin, routeKm)));
  }

  private async _handleAddress(): Promise<void> {
    const context = this.context;
    const texto = context.texto;
    const establishmentCityName = context.estCity.split(',')[0]?.trim().toLowerCase() ?? '';

    if (texto === '__location__' && context.locationLatitude != null && context.locationLongitude != null) {
      const lat = Number(context.locationLatitude);
      const lng = Number(context.locationLongitude);
      const distance = haversine(context.estLat, context.estLng, lat, lng);

      if (this._coordsConfigured() && distance > context.maxRadiusKm) {
        context.newCart.address = 'Localização compartilhada';
        context.newState = BotState.OFFER_PICKUP;
        context.respostas.push(offerPickupBtn(MessagesConstants.ENDERECO_FORA_AREA(context.maxRadiusKm)));
        return;
      }

      let routeKm = 0;
      let routeMin = 0;
      if (this._coordsConfigured()) {
        const route = await context.routingProvider.route(context.estLat, context.estLng, lat, lng);
        if (route) { routeKm = route.km; routeMin = route.min; }
      }

      let addressLabel = 'Localização compartilhada';
      const reverseResult = await context.geocodingProvider.reverse(lat, lng);
      if (reverseResult?.address) {
        const address = reverseResult.address;
        const parts = [
          address.road,
          address.house_number,
          address.suburb || address.neighbourhood,
          address.city || address.town || address.village,
          address.state_code || address.state,
        ].filter(Boolean);
        if (parts.length > 0) addressLabel = parts.join(', ');
      }

      const { total: cartSubtotal } = cartSummary(context.newCart.items);
      const calcFee = context.calcDeliveryFee(routeKm, routeMin, cartSubtotal);
      context.newCart.address = addressLabel;
      context.newCart.delivery_fee = calcFee;
      context.newState = BotState.AWAITING_COMPLEMENT;
      context.respostas.push(locationMsg(lat, lng, 'Endereço de entrega', addressLabel));
      context.respostas.push(MessagesConstants.LOCALIZACAO_RECEBIDA(addressLabel, this._buildEtaLine(calcFee, routeMin, routeKm)));
      return;
    }

    const input = texto.trim();
    const cepDigits = input.replace(/\D/g, '');
    let addressToGeocode = input;
    let cepInfo: CepResponse | null = null;

    if (cepDigits.length === 8) {
      cepInfo = await context.cepProvider.lookup(cepDigits);

      const nonFormattingChars = input.replace(/[\d\s.\-]/g, '');
      const isCepOnly = nonFormattingChars.length === 0;

      if (isCepOnly && cepInfo) {
        const streetLabel = [cepInfo.logradouro, cepInfo.bairro, cepInfo.localidade, cepInfo.uf].filter(Boolean).join(', ');
        context.newCart.address_street_temp = JSON.stringify({
          logradouro: cepInfo.logradouro || '',
          bairro: cepInfo.bairro || '',
          localidade: cepInfo.localidade || '',
          uf: cepInfo.uf || '',
          cep: cepInfo.cep || '',
        });
        context.newState = BotState.AWAITING_ADDRESS_NUMBER;
        context.respostas.push(MessagesConstants.CEP_ENCONTRADO(cepInfo.cep, streetLabel));
        context.earlyResponse = context.buildPayload();
        return;
      }

      if (cepInfo) {
        const parts = [cepInfo.logradouro, cepInfo.bairro, cepInfo.localidade, cepInfo.uf].filter(Boolean);
        if (parts.length > 0) addressToGeocode = parts.join(', ');
      }
    }

    const streetAndNumberMatch = input.match(/^(.+?\s+\d+)/);
    const streetAndNumber = streetAndNumberMatch ? (streetAndNumberMatch[1] ?? input).trim() : input;

    let geoResult = await context.geocodingProvider.search(addressToGeocode + ', Brasil');

    if (!geoResult && context.estCity && !addressToGeocode.toLowerCase().includes(establishmentCityName)) {
      const withCity = addressToGeocode + ', ' + context.estCity;
      geoResult = await context.geocodingProvider.search(withCity + ', Brasil');
      if (geoResult) addressToGeocode = withCity;
    }

    if (!geoResult && context.estCity && streetAndNumber !== addressToGeocode) {
      const stripped = streetAndNumber + ', ' + context.estCity;
      geoResult = await context.geocodingProvider.search(stripped + ', Brasil');
      if (geoResult) addressToGeocode = stripped;
    }

    if (!geoResult) {
      const hint = cepInfo
        ? MessagesConstants.ENDERECO_HINT_CEP(cepInfo.cep, addressToGeocode)
        : MessagesConstants.ENDERECO_HINT(context.estCity);
      context.respostas.push(MessagesConstants.ENDERECO_NAO_ENCONTRADO(hint));
      return;
    }

    await this._applyRoute(parseFloat(geoResult.lat), parseFloat(geoResult.lon), addressToGeocode);
  }

  private async _handleAddressNumber(): Promise<void> {
    const context = this.context;
    const numberInput = context.texto.trim();
    let streetInfo: Record<string, string> = {};
    try {
      streetInfo = JSON.parse(context.newCart.address_street_temp || '{}') as Record<string, string>;
    } catch {
      streetInfo = {};
    }

    if (!streetInfo['localidade']) {
      context.newState = BotState.AWAITING_ADDRESS;
      context.respostas.push(MessagesConstants.ENDERECO_INVALIDO_RETRY(context.estCity || ''));
      return;
    }

    const numberLabel = numberInput === 's/n' ? 'S/N' : numberInput;
    const fullAddress = [streetInfo['logradouro'], numberLabel, streetInfo['bairro'], streetInfo['localidade'], streetInfo['uf']].filter(Boolean).join(', ');
    context.newCart.address_street_temp = null;

    const geoResult = await context.geocodingProvider.search(fullAddress + ', Brasil');

    if (!geoResult) {
      const { total: cartSubtotal } = cartSummary(context.newCart.items);
      const fee = context.calcDeliveryFee(0, 0, cartSubtotal);
      const mapsLink = 'https://maps.google.com/?q=' + encodeURIComponent(fullAddress);
      context.newCart.address = fullAddress;
      context.newCart.delivery_fee = fee;
      const feeMessage = fee === 0 ? MessagesConstants.FRETE_GRATIS : MessagesConstants.TAXA_ENTREGA(fmtBRL(fee));
      context.newState = BotState.AWAITING_COMPLEMENT;
      context.respostas.push(MessagesConstants.ENDERECO_CONFIRMADO_CEP(fullAddress, mapsLink, feeMessage));
      return;
    }

    await this._applyRoute(parseFloat(geoResult.lat), parseFloat(geoResult.lon), fullAddress);
  }
}
