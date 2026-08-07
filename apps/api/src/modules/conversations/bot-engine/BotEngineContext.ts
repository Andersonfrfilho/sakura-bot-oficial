// Porte mecânico de src/setup.ts: tudo que era `let`/`const` de topo de script vira campo desta
// classe, passada explicitamente para cada handler.

import { MessageBuilder, yesNo } from './MessageBuilder.ts';
import { FetchHttpClientProviderImplementation } from './providers/FetchHttpClientProviderImplementation.ts';
import { NominatimProviderImplementation } from './providers/NominatimProviderImplementation.ts';
import { OsrmProviderImplementation } from './providers/OsrmProviderImplementation.ts';
import { ViaCepProviderImplementation } from './providers/ViaCepProviderImplementation.ts';
import type { CepProvider } from './providers/contracts/CepProvider.ts';
import type { GeocodingProvider } from './providers/contracts/GeocodingProvider.ts';
import type { HttpClientProvider } from './providers/contracts/HttpClientProvider.ts';
import type { RoutingProvider } from './providers/contracts/RoutingProvider.ts';
import {
  BotState,
  CartConstants,
  ExpectingRawInputStates,
  IDLE_STATES,
} from './shared/botEngine.constant.ts';
import { MessagesConstants } from './shared/messages.constant.ts';
import { capitalizeName, validateName } from './shared/formatting.util.ts';
import type {
  BotEngineData,
  BotEngineResult,
  Cart,
  CartItem,
  DeliveryFeeRule,
  EstablishmentConfig,
  FeeZone,
  IncomingMessage,
  LastOrder,
  Order,
  OrderType,
  OutgoingMessage,
  PaymentType,
  Product,
  RecentOrder,
  Reservation,
  ReservationTemp,
  RestaurantTable,
  SessionRaw,
  UpcomingReservation,
} from './shared/botEngine.types.ts';

export type BotEngineProviders = {
  readonly httpClient?: HttpClientProvider;
  readonly cepProvider?: CepProvider;
  readonly geocodingProvider?: GeocodingProvider;
  readonly routingProvider?: RoutingProvider;
};

export type BotEngineContextParams = {
  readonly message: IncomingMessage;
  readonly data: BotEngineData;
  readonly providers?: BotEngineProviders;
};

function parseCart(rawCart: Partial<Cart> | CartItem[] | undefined): Cart {
  if (Array.isArray(rawCart)) {
    return { ...CartConstants.EMPTY(), items: rawCart };
  }
  if (rawCart && typeof rawCart === 'object') {
    return {
      items: Array.isArray(rawCart.items) ? rawCart.items : [],
      order_type: rawCart.order_type || '',
      address: rawCart.address || '',
      complement: rawCart.complement || '',
      delivery_fee: rawCart.delivery_fee || 0,
      payment_method: rawCart.payment_method || '',
      change_for: rawCart.change_for != null ? rawCart.change_for : null,
      split_count: rawCart.split_count || 0,
      split_current: rawCart.split_current || 0,
      split_payments: Array.isArray(rawCart.split_payments) ? rawCart.split_payments : [],
      mixed_method: rawCart.mixed_method || '',
      mixed_label: rawCart.mixed_label || '',
      mixed_amount: rawCart.mixed_amount || 0,
      address_street_temp: rawCart.address_street_temp || null,
      browse_category: rawCart.browse_category || '',
      browse_page: rawCart.browse_page || 0,
      pending_item_id: rawCart.pending_item_id || null,
      pending_item_name: rawCart.pending_item_name || '',
    };
  }
  return CartConstants.EMPTY();
}

export class BotEngineContext {
  readonly tel: string;
  readonly instancia: string;
  readonly texto: string;
  readonly horaAtual: string;
  readonly diaSemana: string;
  readonly locationLatitude: number | null;
  readonly locationLongitude: number | null;

  readonly products: Product[];
  readonly recentOrders: RecentOrder[];
  readonly lastOrder: LastOrder | null;
  readonly paymentTypes: PaymentType[];
  readonly orderTypes: OrderType[];
  readonly restaurantTables: RestaurantTable[];
  readonly upcomingReservations: UpcomingReservation[];

  readonly customerNameFromDatabase: string | null;
  readonly pushNameFormatted: string | null;
  readonly customerName: string | null;
  readonly marketingOptIn: boolean | null;

  readonly currentState: BotState;
  readonly currentCart: Cart;
  readonly sessionWasReset: boolean;
  readonly expectingRawInput: boolean;

  readonly estName: string;
  readonly estCity: string;
  readonly estAddress: string;
  readonly estLat: number;
  readonly estLng: number;
  readonly minOrderValue: number;
  readonly kitchenPhone: string;
  readonly msgWelcome: string;
  readonly msgClosed: string;
  readonly isOpen: boolean;
  readonly featureDelivery: boolean;
  readonly maxRadiusKm: number;
  readonly pixKey: string;
  readonly pixName: string;

  readonly messages: MessageBuilder;
  readonly cepProvider: CepProvider;
  readonly geocodingProvider: GeocodingProvider;
  readonly routingProvider: RoutingProvider;

  respostas: OutgoingMessage[] = [];
  newState: BotState;
  newCart: Cart;
  newReservationTemp: ReservationTemp;
  saveOrder = false;
  finalOrder: Order | null = null;
  saveReservation = false;
  finalReservation: Reservation | null = null;
  saveCustomerName = false;
  customerNameToSave: string | null = null;
  saveMarketingOptIn = false;
  marketingOptInValue: boolean | null = null;
  requestHumanHandoff = false;
  handoffCustomerName = '';
  earlyResponse: BotEngineResult | null = null;

  private readonly feeRule: DeliveryFeeRule;
  private readonly feeMode: string;
  private readonly baseFee: number;
  private readonly feePerKm: number;
  private readonly feePerMin: number;
  private readonly freeDeliveryAbove: number;

  constructor(params: BotEngineContextParams) {
    const { message, data } = params;
    const establishment: EstablishmentConfig = data.establishment ?? {};
    const config: Record<string, string> = data.config ?? {};
    const sessionRaw: SessionRaw = data.session ?? {};

    this.tel = message.tel;
    this.instancia = message.instancia;
    this.texto = message.texto;
    this.horaAtual = message.horaAtual;
    this.diaSemana = message.diaSemana;
    this.locationLatitude = message.location_lat ?? null;
    this.locationLongitude = message.location_lng ?? null;

    this.products = data.products ?? [];
    this.recentOrders = data.recent_orders ?? [];
    this.lastOrder = data.last_order ?? null;
    this.paymentTypes = data.payment_types ?? [];
    this.orderTypes = data.order_types ?? [];
    this.restaurantTables = data.restaurant_tables ?? [];
    this.upcomingReservations = data.upcoming_reservations ?? [];

    const sessionTtlMinutes = establishment.session_ttl_min ?? parseInt(config['session_ttl_min'] || '60', 10);
    const lastActivity = sessionRaw.last_activity_at ? new Date(sessionRaw.last_activity_at) : null;
    const sessionExpired = lastActivity
      ? (Date.now() - lastActivity.getTime()) > sessionTtlMinutes * 60 * 1000
      : false;
    this.currentState = sessionExpired && !IDLE_STATES.includes(sessionRaw.state || 'start')
      ? BotState.START
      : ((sessionRaw.state || BotState.START) as BotState);
    this.sessionWasReset = sessionExpired && !!sessionRaw.state && !IDLE_STATES.includes(sessionRaw.state);

    this.customerNameFromDatabase = data.customer_name ?? null;
    const pushName = message.push_name || '';
    const pushNameValidation = (!this.customerNameFromDatabase && pushName)
      ? validateName(pushName)
      : { valid: false };
    this.pushNameFormatted = pushNameValidation.valid ? capitalizeName(pushName) : null;
    this.customerName = this.customerNameFromDatabase || this.pushNameFormatted || null;
    this.marketingOptIn = data.marketing_opt_in !== undefined && data.marketing_opt_in !== null
      ? Boolean(data.marketing_opt_in)
      : null;

    this.currentCart = parseCart(sessionRaw.cart);

    const openingTime = establishment.opening_time || config['opening_time'] || '18:00';
    const closingTime = establishment.closing_time || config['closing_time'] || '23:00';
    const workingDays = (establishment.working_days || config['working_days'] || 'ter,qua,qui,sex,sab,dom').split(',');
    const ignoreHours = establishment.ignore_hours ?? config['ignore_hours'] === 'true';
    this.msgClosed = (establishment.msg_closed || config['msg_closed'] || 'Estamos fechados agora!').replace(/\\n/g, '\n');
    this.msgWelcome = (establishment.msg_welcome || config['msg_welcome'] || 'Ola! Bem-vindo!').replace(/\\n/g, '\n');
    this.estName = establishment.name || config['establishment_name'] || 'nosso estabelecimento';
    this.estCity = establishment.city || config['establishment_city'] || '';
    this.estAddress = establishment.address || config['establishment_address'] || '';
    this.minOrderValue = establishment.min_order_value != null
      ? establishment.min_order_value
      : parseFloat(config['min_order_value'] || '0');
    this.kitchenPhone = establishment.kitchen_phone || config['kitchen_phone'] || '';

    this.featureDelivery = this.orderTypes.some((orderType: OrderType) => orderType.name === 'delivery');
    this.feeRule = data.delivery_fee_rule ?? {};
    this.feeMode = this.feeRule.mode || 'fixed';
    this.baseFee = Number(this.feeRule.base_fee ?? 0);
    this.feePerKm = Number(this.feeRule.per_km_rate ?? 0);
    this.feePerMin = Number(this.feeRule.per_min_rate ?? 0);
    this.freeDeliveryAbove = Number(this.feeRule.free_above ?? 0);
    this.maxRadiusKm = Number(this.feeRule.max_radius_km ?? 10);
    this.estLat = establishment.lat ?? Number(config['establishment_lat'] || 0);
    this.estLng = establishment.lng ?? Number(config['establishment_lng'] || 0);

    const pixType = this.paymentTypes.find((paymentType: PaymentType) => paymentType.name === 'pix');
    const pixConfig = pixType?.config ?? {};
    this.pixKey = pixConfig['chave'] || '';
    this.pixName = pixConfig['nome'] || '';

    this.newReservationTemp = sessionRaw.reservation_temp ?? {};
    this.newState = this.currentState;
    this.newCart = JSON.parse(JSON.stringify(this.currentCart)) as Cart;

    this.expectingRawInput = ExpectingRawInputStates.includes(this.currentState);
    this.isOpen = ignoreHours || (
      workingDays.includes(this.diaSemana)
      && this.horaAtual >= openingTime
      && this.horaAtual <= closingTime
    );

    const httpClient = params.providers?.httpClient ?? new FetchHttpClientProviderImplementation();
    this.cepProvider = params.providers?.cepProvider ?? new ViaCepProviderImplementation(httpClient);
    this.geocodingProvider = params.providers?.geocodingProvider ?? new NominatimProviderImplementation(httpClient);
    this.routingProvider = params.providers?.routingProvider ?? new OsrmProviderImplementation(httpClient);

    this.messages = new MessageBuilder({
      products: this.products,
      orderTypes: this.orderTypes,
      paymentTypes: this.paymentTypes,
    });

    if (this.sessionWasReset && this.texto !== 'sair' && this.texto !== 'cancelar') {
      this.respostas.push(MessagesConstants.SESSION_EXPIRED);
    }
  }

  calcDeliveryFee(km: number, min: number, subtotal: number): number {
    if (this.freeDeliveryAbove > 0 && subtotal >= this.freeDeliveryAbove) return 0;
    let fee: number;
    if (this.feeMode === 'per_km') {
      fee = this.baseFee + km * this.feePerKm;
    } else if (this.feeMode === 'per_route_min') {
      fee = this.baseFee + min * this.feePerMin;
    } else if (this.feeMode === 'zones_km' || this.feeMode === 'zones_min') {
      const value = this.feeMode === 'zones_km' ? km : min;
      const zone = (this.feeRule.zones || []).find((feeZone: FeeZone) =>
        feeZone.type === (this.feeMode === 'zones_km' ? 'km' : 'min') && value >= feeZone.min && value < feeZone.max);
      fee = zone ? zone.fee : this.baseFee;
    } else {
      fee = this.baseFee;
    }
    return Math.ceil(fee * 10) / 10;
  }

  maybeAskOptIn(): void {
    if (this.marketingOptIn === null) {
      this.respostas.push(yesNo(MessagesConstants.OPT_IN_PERGUNTA));
      this.newState = BotState.AWAITING_MARKETING_OPT_IN;
    }
  }

  buildPayload(): BotEngineResult {
    return {
      tel: this.tel,
      instancia: this.instancia,
      respostas: this.respostas,
      state: this.newState,
      cart: this.newCart,
      reservation_temp: this.newReservationTemp,
      save_order: this.saveOrder,
      order: this.finalOrder,
      save_reservation: this.saveReservation,
      reservation: this.finalReservation,
      save_customer_name: this.saveCustomerName,
      customer_name_to_save: this.customerNameToSave,
      save_marketing_opt_in: this.saveMarketingOptIn,
      marketing_opt_in_value: this.marketingOptInValue,
      kitchen_phone: this.kitchenPhone,
      request_human_handoff: this.requestHumanHandoff,
      handoff_customer_name: this.handoffCustomerName,
    };
  }
}
