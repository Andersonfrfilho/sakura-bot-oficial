// ── Leitura de contexto do n8n ───────────────────────────────────────────────
const msgData = ($("Calcular Hora") as { first(): { json: MsgData } }).first().json;
const { tel, instancia, texto, horaAtual, diaSemana, location_lat, location_lng } = msgData;

const inputData = $json as N8nInputData;
const establishment: EstablishmentConfig = inputData.establishment || {} as EstablishmentConfig;
const config: Record<string, string>     = inputData.config || {};
const products: Product[]                = inputData.products || [];
const recentOrders: RecentOrder[]        = inputData.recent_orders || [];
const sessionRaw: SessionRaw             = inputData.session || {};
const lastOrder: LastOrder | null        = inputData.last_order || null;
const paymentTypes: PaymentType[]        = inputData.payment_types || [];
const orderTypes: OrderType[]            = inputData.order_types || [];

// ── TTL de sessão ────────────────────────────────────────────────────────────
const sessionTtlMin = establishment.session_ttl_min ?? parseInt(config['session_ttl_min'] || '60', 10);
const lastActivity  = sessionRaw.last_activity_at ? new Date(sessionRaw.last_activity_at) : null;
const sessionExpired = lastActivity
  ? (Date.now() - lastActivity.getTime()) > sessionTtlMin * 60 * 1000
  : false;
const idleStates = ['start', 'ordering', 'repeat_order', 'awaiting_name', 'awaiting_marketing_opt_in'];
let currentState = sessionExpired && !idleStates.includes(sessionRaw.state || 'start')
  ? BotState.START
  : ((sessionRaw.state || BotState.START) as BotState);
const sessionWasReset = sessionExpired && !!sessionRaw.state && !idleStates.includes(sessionRaw.state);

// ── Nome do cliente ──────────────────────────────────────────────────────────
const customerNameFromDB: string | null = inputData.customer_name || null;
const pushName: string = msgData.push_name || '';
const pushNameValidation = (!customerNameFromDB && pushName) ? validateName(pushName) : { valid: false };
const pushNameFormatted: string | null  = pushNameValidation.valid ? capitalizeName(pushName) : null;
const customerName: string | null       = customerNameFromDB || pushNameFormatted || null;
const marketingOptIn: boolean | null    = inputData.marketing_opt_in !== undefined && inputData.marketing_opt_in !== null
  ? Boolean(inputData.marketing_opt_in) : null;

// ── Carrinho ─────────────────────────────────────────────────────────────────
const rawCart: Partial<Cart> | CartItem[] | undefined = sessionRaw.cart;
let currentCart: Cart;
if (Array.isArray(rawCart)) {
  currentCart = { ...CartConstants.EMPTY(), items: rawCart };
} else if (rawCart && typeof rawCart === 'object') {
  currentCart = {
    items:              Array.isArray(rawCart.items) ? rawCart.items : [],
    order_type:         rawCart.order_type || '',
    address:            rawCart.address || '',
    complement:         rawCart.complement || '',
    delivery_fee:       rawCart.delivery_fee || 0,
    payment_method:     rawCart.payment_method || '',
    change_for:         rawCart.change_for != null ? rawCart.change_for : null,
    split_count:        rawCart.split_count || 0,
    split_current:      rawCart.split_current || 0,
    split_payments:     Array.isArray(rawCart.split_payments) ? rawCart.split_payments : [],
    mixed_method:       rawCart.mixed_method || '',
    mixed_label:        rawCart.mixed_label || '',
    mixed_amount:       rawCart.mixed_amount || 0,
    address_street_temp: rawCart.address_street_temp || null,
    browse_category:    rawCart.browse_category || '',
    browse_page:        rawCart.browse_page || 0,
    pending_item_id:    rawCart.pending_item_id || null,
    pending_item_name:  rawCart.pending_item_name || '',
  };
} else {
  currentCart = CartConstants.EMPTY();
}

// ── Configurações de negócio ─────────────────────────────────────────────────
const openingTime    = establishment.opening_time  || config['opening_time']  || '18:00';
const closingTime    = establishment.closing_time  || config['closing_time']  || '23:00';
const workingDays    = (establishment.working_days || config['working_days'] || 'ter,qua,qui,sex,sab,dom').split(',');
const msgClosed      = (establishment.msg_closed   || config['msg_closed']   || 'Estamos fechados agora!').replace(/\\n/g, '\n');
const msgWelcome     = (establishment.msg_welcome  || config['msg_welcome']  || 'Ola! Bem-vindo!').replace(/\\n/g, '\n');
const ignoreHours    = establishment.ignore_hours  ?? config['ignore_hours'] === 'true';
const estName        = establishment.name          || config['establishment_name']    || 'nosso estabelecimento';
const estCity        = establishment.city          || config['establishment_city']    || '';
const estAddress     = establishment.address       || config['establishment_address'] || '';
const minOrderValue  = establishment.min_order_value != null ? establishment.min_order_value : parseFloat(config['min_order_value'] || '0');
const kitchenPhone   = establishment.kitchen_phone  || config['kitchen_phone']           || '';

// ── Tipos de pedido / entrega ────────────────────────────────────────────────
const featureDelivery = orderTypes.some((orderType: OrderType) => orderType.name === 'delivery');
const featureRetirada = orderTypes.some((orderType: OrderType) => orderType.name === 'retirada');
const feeRule         = inputData.delivery_fee_rule || {} as DeliveryFeeRule;
const feeMode         = feeRule.mode          || 'fixed';
const baseFee         = Number(feeRule.base_fee      ?? 0);
const feePerKm        = Number(feeRule.per_km_rate   ?? 0);
const feePerMin       = Number(feeRule.per_min_rate  ?? 0);
const freeDeliveryAbove = Number(feeRule.free_above  ?? 0);
const maxRadiusKm     = Number(feeRule.max_radius_km ?? 10);
const estLat          = establishment.lat ?? Number(config['establishment_lat'] || 0);
const estLng          = establishment.lng ?? Number(config['establishment_lng'] || 0);

// ── PIX ──────────────────────────────────────────────────────────────────────
const pixType   = paymentTypes.find((paymentType: PaymentType) => paymentType.name === 'pix') || {} as PaymentType;
const pixConfig = pixType.config || {} as Record<string, string>;
const pixKey    = pixConfig['chave'] || '';
const pixName   = pixConfig['nome']  || '';

// ── Reservas ─────────────────────────────────────────────────────────────────
const restaurantTables: RestaurantTable[]         = inputData.restaurant_tables || [];
const upcomingReservations: UpcomingReservation[] = inputData.upcoming_reservations || [];
let newReservationTemp: ReservationTemp = sessionRaw.reservation_temp || {};

// ── Estado mutable ───────────────────────────────────────────────────────────
let respostas: OutgoingMessage[]    = [];
let newState: BotState              = currentState;
let newCart: Cart                   = JSON.parse(JSON.stringify(currentCart));
let save_order                      = false;
let finalOrder: Order | null        = null;
let save_reservation                = false;
let finalReservation: Reservation | null = null;
let save_customer_name              = false;
let customerNameToSave: string | null = null;
let save_marketing_opt_in           = false;
let marketing_opt_in_value: boolean | null = null;
let create_chatwoot_conversation    = false;
let chatwootCustomerName            = '';

// Usado pelos handlers para retorno antecipado (evita top-level return)
let _earlyResponse: N8nResponsePayload | null = null;

// ── HTTP helper global — captura o contexto do n8n via arrow (herda 'this' externo) ──
interface N8nRuntimeContext {
  helpers: { httpRequest: (options: Record<string, unknown>) => Promise<unknown> };
}
const _httpRequest = async (options: Record<string, unknown>): Promise<unknown> =>
  // @ts-ignore — arrow captura o 'this' do n8n Code node; TS7041 é falso-positivo em module:none
  (this as unknown as N8nRuntimeContext).helpers.httpRequest(options);

// ── Providers de integração externa ──────────────────────────────────────────
const httpClient: HttpClientProvider       = new N8nHttpClientProviderImplementation();
const cepProvider: CepProvider             = new ViaCepProviderImplementation(httpClient);
const geocodingProvider: GeocodingProvider = new NominatimProviderImplementation(httpClient);
const routingProvider: RoutingProvider     = new OsrmProviderImplementation(httpClient);

// ── Guard de input raw ───────────────────────────────────────────────────────
const expectingRawInput = ExpectingRawInputStates.includes(currentState);

// ── Funções de formatação ────────────────────────────────────────────────────
function fmtBRL(value: number): string {
  return Number(value).toFixed(2).replace('.', ',');
}

function fmtDuration(minutes: number): string {
  if (minutes < 60) return minutes + ' min';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours + 'h' + (mins > 0 ? ' ' + mins + 'min' : '');
}

function fmtDate(iso: string): string {
  return iso ? iso.split('-').reverse().join('/') : '';
}

function validateName(raw: string): ValidarNomeResult {
  const name = raw.trim();
  if (name.length < 2) return { valid: false, reason: 'short' };
  if (/\d/.test(name)) return { valid: false, reason: 'numbers' };
  if (!/^[\p{L}\s'\-]+$/u.test(name)) return { valid: false, reason: 'invalid_chars' };
  if (/^(.)\1{3,}$/u.test(name.replace(/\s/g, ''))) return { valid: false, reason: 'repeated' };
  const bad = ['merda','porra','caralho','buceta','viado','puta','fdp','cuzão','cuza','cuzao','fuder','foder','foda','arrombado','babaca','idiota','imbecil','cretino','otario','otário','lixo','vagabundo','vagabunda','piranha','safado','safada','desgraça','desgraca','bosta','pau','cacete','xoxota','pentelho','prostituta'];
  const lower = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const word of bad) {
    const wordNorm = word.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (lower === wordNorm || lower.split(/\s+/).includes(wordNorm)) return { valid: false, reason: 'bad_word' };
  }
  return { valid: true };
}

function capitalizeName(name: string): string {
  return name.trim().replace(/\b\p{L}/gu, (char: string) => char.toUpperCase());
}

function parseTrocoInput(texto: string, amountToPay: number): number | null {
  const normalized = texto.trim().toLowerCase().replace(',', '.');
  const trocoMatch = normalized.match(/^([\d.]+)\s*(?:de\s*)?troco$/) || normalized.match(/^troco\s*(?:de\s*)?([\d.]+)$/);
  if (trocoMatch) {
    const troco = parseFloat(trocoMatch[1]);
    return isNaN(troco) ? null : amountToPay + troco;
  }
  const val = parseFloat(normalized);
  return isNaN(val) ? null : val;
}

function cartSummary(items: CartItem[]): CartSummarioResult {
  let total = 0;
  const lines: string[] = [];
  for (const item of items) {
    const sub = item.price * item.qty;
    total += sub;
    lines.push('• *' + item.name + '* × ' + item.qty + ' — R$ ' + fmtBRL(sub));
  }
  return { lines, total };
}

function calcDeliveryFee(km: number, min: number, subtotal: number): number {
  if (freeDeliveryAbove > 0 && subtotal >= freeDeliveryAbove) return 0;
  let fee: number;
  if (feeMode === 'per_km')            fee = baseFee + km * feePerKm;
  else if (feeMode === 'per_route_min') fee = baseFee + min * feePerMin;
  else if (feeMode === 'zones_km' || feeMode === 'zones_min') {
    const value = feeMode === 'zones_km' ? km : min;
    const zone = (feeRule.zones || []).find((feeZone: FeeZone) => feeZone.type === (feeMode === 'zones_km' ? 'km' : 'min') && value >= feeZone.min && value < feeZone.max);
    fee = zone ? zone.fee : baseFee;
  } else fee = baseFee;
  return Math.ceil(fee * 10) / 10;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateOrderCode(phone: string): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return 'PED-' + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '-' + phone.slice(-4);
}

function parseDate(text: string): string | null {
  const now = new Date();
  const normalized = text.toLowerCase();
  if (normalized.includes('hoje')) return now.toISOString().split('T')[0];
  if (normalized.includes('amanhã') || normalized.includes('amanha')) {
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  const ddmm = normalized.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
  if (ddmm) {
    const day = parseInt(ddmm[1]), month = parseInt(ddmm[2]) - 1;
    const year = ddmm[3] ? parseInt(ddmm[3]) : now.getFullYear();
    const date = new Date(year, month, day);
    if (date <= now && !ddmm[3]) date.setFullYear(date.getFullYear() + 1);
    return date.toISOString().split('T')[0];
  }
  const dayMap: Record<string, number> = {'segunda':1,'terça':2,'terca':2,'quarta':3,'quinta':4,'sexta':5,'sábado':6,'sabado':6,'domingo':0};
  for (const [dayName, dayNum] of Object.entries(dayMap)) {
    if (normalized.includes(dayName)) {
      const date = new Date(now);
      let diff = (dayNum - date.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      date.setDate(date.getDate() + diff);
      return date.toISOString().split('T')[0];
    }
  }
  return null;
}

function parseTime(text: string): string | null {
  const match = text.match(/(\d{1,2})\s*[hH]\s*(\d{2})?|(\d{1,2}):(\d{2})/);
  if (!match) return null;
  if (match[1] !== undefined) return match[1].padStart(2,'0') + ':' + (match[2] || '00');
  return match[3].padStart(2,'0') + ':' + match[4];
}

function parsePeople(text: string): number | null {
  const match1 = text.match(/para\s+(\d{1,2})\s*(?:pessoas?|pax)?/i);
  if (match1) { const count = parseInt(match1[1]); if (count>=1 && count<=30) return count; }
  const match2 = text.match(/(\d{1,2})\s*(?:pessoas?|pax|adultos?)/i);
  if (match2) { const count = parseInt(match2[1]); if (count>=1 && count<=30) return count; }
  return null;
}

// ── Builders de mensagens UI ─────────────────────────────────────────────────
function mainMenu(): ButtonMessage {
  return {
    type: 'buttons',
    body: 'Como posso ajudar? 😊\n\n_Pedidos: *meu pedido* · Notificações: *notificações*_\n_Digite *sair* para recomeçar._',
    buttons: [
      { id: '2', title: '🛒 Fazer Pedido' },
      { id: '3', title: '📋 Reservar Mesa' },
      { id: '4', title: '👤 Falar com Atendente' }
    ],
  };
}

function yesNo(body: string): ButtonMessage {
  return { type: 'buttons', body, buttons: [{ id: 'sim', title: 'Sim ✅' }, { id: 'não', title: 'Não ❌' }] };
}

function confirmBtn(body: string): ButtonMessage {
  return { type: 'buttons', body, buttons: [{ id: 'sim', title: '✅ Confirmar' }, { id: 'não', title: '❌ Cancelar' }] };
}

function offerPickupBtn(body: string): ButtonMessage {
  return { type: 'buttons', body, buttons: [{ id: 'sim', title: '✅ Sim, retirar' }, { id: 'não', title: '📍 Outro endereço' }] };
}

function orderTypeBtn(): ButtonMessage {
  return {
    type: 'buttons',
    body: MessagesConstants.SOLICITAR_TIPO_PEDIDO,
    buttons: orderTypes.filter((orderType: OrderType) => orderType.active !== false).slice(0, 3).map((orderType: OrderType) => ({ id: orderType.name, title: orderType.label })),
  };
}

function paymentEmoji(name: string): string {
  if (name === 'pix') return '🔷';
  if (name === 'dinheiro') return '💵';
  return '💳';
}

function paymentList(splitCount: number, hideMixed?: boolean): ListMessage {
  const rows = paymentTypes.map((paymentType: PaymentType) => ({ id: paymentType.name, title: paymentEmoji(paymentType.name) + ' ' + paymentType.label }));
  if (!splitCount || splitCount < 2) rows.push({ id: 'dividir', title: '👥 Dividir entre pessoas' });
  if (!hideMixed && paymentTypes.length > 1) rows.push({ id: 'misto', title: '💰 Pagamento misto' });
  return { type: 'list', body: MessagesConstants.SOLICITAR_PAGAMENTO, button: 'Ver opções', sections: [{ title: 'Forma de Pagamento', rows }] };
}

function splitPersonPaymentList(personNum: number, totalPersons: number, perPersonStr: string): ListMessage {
  const rows = paymentTypes.map((paymentType: PaymentType) => ({ id: paymentType.name, title: paymentEmoji(paymentType.name) + ' ' + paymentType.label }));
  return {
    type: 'list',
    body: '👥 *' + totalPersons + ' pessoas — R$ ' + perPersonStr + '/pessoa*\n\n*Pessoa ' + personNum + ' de ' + totalPersons + ':* Como vai pagar?',
    button: 'Ver opções',
    sections: [{ title: 'Forma de Pagamento', rows }],
  };
}

function notifBtn(currentOptIn: boolean | null): ButtonMessage {
  const status = currentOptIn === true
    ? '🔔 *Notificações ativas*\nVocê recebe promoções e novidades.'
    : currentOptIn === false
      ? '🔕 *Notificações desativadas*\nVocê não recebe promoções.'
      : '🔔 *Notificações*\nConfigure suas preferências:';
  if (currentOptIn === true) return { type: 'buttons', body: status, buttons: [{ id: 'desativar', title: '🔕 Desativar' }, { id: '0', title: '↩️ Voltar' }] };
  return { type: 'buttons', body: status, buttons: [{ id: 'ativar', title: '🔔 Ativar' }, { id: '0', title: '↩️ Voltar' }] };
}

function categoryList(context: string): ListMessage | string {
  if (!products || products.length === 0) return MessagesConstants.CARDAPIO_INDISPONIVEL;
  const cats = [...new Set(products.map((product: Product) => product.category || 'Outros'))] as string[];
  const prefix = context === 'order' ? 'order_cat:' : 'cat:';
  const rows = cats.map((categoryName: string) => {
    const categoryItems = products.filter((product: Product) => (product.category || 'Outros') === categoryName);
    const catTitle = ((categoryItems[0]?.emoji || '🍽️') + ' ' + categoryName).slice(0, 24);
    return { id: prefix + categoryName.toLowerCase(), title: catTitle, description: categoryItems.length + ' item(s)' };
  });
  const body = context === 'order' ? '🛒 *Fazer Pedido*\n\nEscolha uma categoria:' : '🍣 *Cardápio*\n\nEscolha uma categoria:';
  return { type: 'list', body, button: 'Ver categorias', sections: [{ title: 'Categorias', rows }] };
}

function itemsList(categoryName: string, context: string, page: number): TextMenuMessage {
  page = page || 0;
  const allItems = products.filter((product: Product) => (product.category || 'Outros') === categoryName);
  const PAGE_SIZE = 9;
  const start = page * PAGE_SIZE;
  const slice = allItems.slice(start, start + PAGE_SIZE);
  const hasMore = allItems.length > start + PAGE_SIZE;
  const lines: string[] = ['🍽️ *' + categoryName + '*\n'];
  slice.forEach((product: Product, index: number) => {
    const priceStr = 'R$ ' + fmtBRL(product.price);
    const descStr = product.description ? ' — _' + String(product.description).slice(0, 60) + '_' : '';
    lines.push((start + index + 1) + '. ' + (product.emoji ? product.emoji + ' ' : '') + product.name + ' — ' + priceStr + descStr);
  });
  if (hasMore) lines.push(MessagesConstants.PROXIMA_PAGINA(page + 2));
  lines.push(MessagesConstants.VOLTAR_INSTRUCAO);
  return {
    type: 'text_menu',
    body: lines.join('\n'),
    items: slice.map((product: Product, index: number) => ({ num: start + index + 1, id: product.id, name: product.name })),
    categoryName,
    context,
    page,
    hasMore,
  };
}

function locationMsg(lat: number, lng: number, name: string, address: string): LocationMessage {
  return { type: 'location', latitude: lat, longitude: lng, name: name || 'Endereço de entrega', address: address || '' };
}

function nonCashOptions(): string {
  return paymentTypes
    .filter((paymentType: PaymentType) => paymentType.name !== 'dinheiro')
    .map((paymentType: PaymentType, index: number) => (index+1) + '. ' + paymentType.label)
    .join('\n');
}

function buildRepeatOrderLines(params: ConstruirLinhasPedidoParams): string[] {
  const { lastOrder: lastOrderParam, products: prods, header } = params;
  const items = lastOrderParam.items;
  const lines: string[] = [header + '\n'];
  let newTotal = 0;
  let hasChanges = false;
  const unavailable: string[] = [];

  for (const item of items) {
    const currentProduct = prods.find((product: Product) => product.id === item.id);
    if (!currentProduct) { unavailable.push(item.name); continue; }
    const oldUnitPrice = Number(item.price);
    const newUnitPrice = Number(currentProduct.price);
    const newLineTotal = newUnitPrice * item.qty;
    newTotal += newLineTotal;
    if (Math.abs(newUnitPrice - oldUnitPrice) >= 0.01) {
      hasChanges = true;
      const diff = newLineTotal - (oldUnitPrice * item.qty);
      const sign = diff > 0 ? '+' : '−';
      const icon = diff < 0 ? ' 🎉' : ' 📢';
      lines.push('• ' + item.name + ' × ' + item.qty + ' — *R$ ' + fmtBRL(newLineTotal) + '*' + icon
        + '\n  _era R$ ' + fmtBRL(oldUnitPrice * item.qty) + ' (' + sign + 'R$ ' + fmtBRL(Math.abs(diff)) + ')_');
    } else {
      lines.push('• ' + item.name + ' — R$ ' + fmtBRL(newUnitPrice) + ' × ' + item.qty + ' — R$ ' + fmtBRL(newLineTotal));
    }
  }
  if (unavailable.length > 0) lines.push('\n⚠️ _Fora do cardápio: ' + unavailable.join(', ') + '_');
  const oldTotal = Number(lastOrderParam.total);
  if (hasChanges && Math.abs(newTotal - oldTotal) >= 0.01) {
    const totalDiff = newTotal - oldTotal;
    const sign = totalDiff > 0 ? '+' : '−';
    lines.push('\n*Total: R$ ' + fmtBRL(newTotal) + '* _(' + sign + 'R$ ' + fmtBRL(Math.abs(totalDiff)) + ' vs último pedido)_');
  } else {
    lines.push('\n*Total: R$ ' + fmtBRL(newTotal) + '*');
  }
  return lines;
}

function maybeAskOptIn(): void {
  if (marketingOptIn === null) {
    respostas.push(yesNo(MessagesConstants.OPT_IN_PERGUNTA));
    newState = BotState.AWAITING_MARKETING_OPT_IN;
  }
}

function buildPayload(): N8nResponsePayload {
  return {
    tel, instancia, respostas,
    state: newState,
    cart: newCart,
    reservation_temp: newReservationTemp,
    save_order, order: finalOrder,
    save_reservation, reservation: finalReservation,
    save_customer_name, customer_name_to_save: customerNameToSave,
    save_marketing_opt_in, marketing_opt_in_value,
    kitchen_phone: kitchenPhone,
    create_chatwoot_conversation,
    chatwoot_customer_name: chatwootCustomerName,
  };
}

const greetings = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'inicio', 'menu', 'start', 'hello', 'hi'];

// ── Verificação de horário ───────────────────────────────────────────────────
const isOpen = ignoreHours || (
  workingDays.includes(diaSemana) &&
  horaAtual >= openingTime &&
  horaAtual <= closingTime
);

if (sessionWasReset && texto !== 'sair' && texto !== 'cancelar') {
  respostas.push(MessagesConstants.SESSION_EXPIRED);
}
