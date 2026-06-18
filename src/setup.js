const msgData = $("Calcular Hora").first().json;
const { tel, instancia, texto, horaAtual, diaSemana, location_lat, location_lng } = msgData;

const config = $json.config || {};
const products = $json.products || [];
const recentOrders = $json.recent_orders || [];
const sessionRaw = $json.session || {};
const lastOrder = $json.last_order || null;
const paymentTypes = $json.payment_types || [];
const orderTypes = $json.order_types || [];

// ── Session TTL: se inativo além do limite, reinicia estado ──────────
const sessionTtlMin = parseInt(config['session_ttl_min'] || '60', 10);
const lastActivity = sessionRaw.last_activity_at ? new Date(sessionRaw.last_activity_at) : null;
const sessionExpired = lastActivity
  ? (Date.now() - lastActivity.getTime()) > sessionTtlMin * 60 * 1000
  : false;
// Estados de início não precisam de reset (já estão em fluxo novo)
const idleStates = ['start', 'ordering', 'repeat_order', 'awaiting_name', 'awaiting_marketing_opt_in'];
let currentState = sessionExpired && !idleStates.includes(sessionRaw.state || 'start')
  ? 'start'
  : (sessionRaw.state || 'start');
const sessionWasReset = sessionExpired && sessionRaw.state && !idleStates.includes(sessionRaw.state);
const customerNameFromDB = $json.customer_name || null;
const pushName = msgData.push_name || '';
// Validate pushName from WhatsApp; use DB name if already saved
const pushNameValidation = (!customerNameFromDB && pushName) ? validateName(pushName) : { valid: false };
const pushNameFormatted = pushNameValidation.valid ? capitalizeName(pushName) : null;
const customerName = customerNameFromDB || pushNameFormatted || null;
const marketingOptIn = $json.marketing_opt_in !== undefined && $json.marketing_opt_in !== null
  ? Boolean($json.marketing_opt_in) : null;

const rawCart = sessionRaw.cart;
let currentCart;
if (Array.isArray(rawCart)) {
  currentCart = { items: rawCart, order_type: '', address: '', delivery_fee: 0, payment_method: '', change_for: null, browse_category: '', browse_page: 0, pending_item_id: null, pending_item_name: '' };
} else if (rawCart && typeof rawCart === 'object') {
  currentCart = {
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
    pending_item_id: rawCart.pending_item_id || null,
    pending_item_name: rawCart.pending_item_name || ''
  };
} else {
  currentCart = { items: [], order_type: '', address: '', delivery_fee: 0, payment_method: '', change_for: null, browse_category: '', browse_page: 0, pending_item_id: null, pending_item_name: '' };
}

// Config values
const openingTime = config['opening_time'] || '18:00';
const closingTime = config['closing_time'] || '23:00';
const workingDays = (config['working_days'] || 'ter,qua,qui,sex,sab,dom').split(',');
const msgClosed = (config['msg_closed'] || 'Estamos fechados agora!').replace(/\\n/g, '\n');
const msgWelcome = (config['msg_welcome'] || 'Ola! Bem-vindo!').replace(/\\n/g, '\n');
const ignoreHours = config['ignore_hours'] === 'true';

// Order types (delivery, retirada, mesa) from DB
const featureDelivery = orderTypes.some(t => t.name === 'delivery');
const featureRetirada = orderTypes.some(t => t.name === 'retirada');
const deliveryOrderType = orderTypes.find(t => t.name === 'delivery') || {};
const feeRule = $json.delivery_fee_rule || {};
const feeMode         = feeRule.mode          || 'fixed';
const baseFee         = Number(feeRule.base_fee      ?? 0);
const feePerKm        = Number(feeRule.per_km_rate   ?? 0);
const feePerMin       = Number(feeRule.per_min_rate  ?? 0);
const freeDeliveryAbove = Number(feeRule.free_above  ?? 0);
const maxRadiusKm     = Number(feeRule.max_radius_km ?? 10);
const fixedDeliveryFee = baseFee;
const feeZones = (feeRule.zones || []).filter(z => z.type === (feeMode === 'zones_min' ? 'min' : 'km'));
const calcDeliveryFee = (km, min, subtotal) => {
  if (freeDeliveryAbove > 0 && subtotal >= freeDeliveryAbove) return 0;
  let f;
  if (feeMode === 'per_km')         f = baseFee + km * feePerKm;
  else if (feeMode === 'per_route_min') f = baseFee + min * feePerMin;
  else if (feeMode === 'zones_km' || feeMode === 'zones_min') {
    const v = feeMode === 'zones_km' ? km : min;
    const zone = (feeRule.zones || []).find(z => z.type === (feeMode === 'zones_km' ? 'km' : 'min') && v >= z.min && v < z.max);
    f = zone ? zone.fee : baseFee;
  } else f = baseFee;
  return Math.ceil(f * 10) / 10;
};
const estLat = Number(config['establishment_lat'] || 0);
const estLng = Number(config['establishment_lng'] || 0);

// Payment types from DB
const pixType = paymentTypes.find(t => t.name === 'pix') || {};
const pixConfig = pixType.config || {};
const pixKey = pixConfig.chave || '';
const pixName = pixConfig.nome || '';

let newReservationTemp = sessionRaw.reservation_temp || {};

const isOpen = ignoreHours || (
  workingDays.includes(diaSemana) &&
  horaAtual >= openingTime &&
  horaAtual <= closingTime
);

if (!isOpen) {
  return [{ json: { tel, instancia, respostas: [msgClosed], state: currentState, cart: currentCart, reservation_temp: newReservationTemp, save_order: false, order: null, save_reservation: false, reservation: null, save_customer_name: false, customer_name_to_save: null, save_marketing_opt_in: false, marketing_opt_in_value: null, kitchen_phone: '', create_chatwoot_conversation: false, chatwoot_customer_name: customerName || '' } }];
}

let respostas = [];
let newState = currentState;
let newCart = JSON.parse(JSON.stringify(currentCart));
let save_order = false;
let finalOrder = null;
let save_reservation = false;
let finalReservation = null;
let save_customer_name = false;
let customerNameToSave = null;
let save_marketing_opt_in = false;
let marketing_opt_in_value = null;
let create_chatwoot_conversation = false;
let chatwootCustomerName = '';


const mainMenu = () => ({
  type: 'buttons',
  body: 'Como posso ajudar? 😊\n\n_Pedidos: *meu pedido* · Notificações: *notificações*_\n_Digite *sair* para recomeçar._',
  buttons: [
    { id: '2', title: '🛒 Fazer Pedido' },
    { id: '3', title: '📋 Reservar Mesa' },
    { id: '4', title: '👤 Falar com Atendente' }
  ]
});

const buildMenu = () => {
  if (!products || products.length === 0) return 'Cardápio temporariamente indisponível.';
  const byCategory = {};
  products.forEach((item, idx) => {
    const cat = item.category || 'Outros';
    if (!byCategory[cat]) byCategory[cat] = { emoji: item.emoji || '🍽️', items: [] };
    byCategory[cat].items.push((idx + 1) + '. ' + item.name + ' — R$ ' + fmtBRL(item.price));
  });
  const lines = ['🍣 *Cardápio*\n'];
  for (const [cat, data] of Object.entries(byCategory)) {
    lines.push(data.emoji + ' *' + cat + '*');
    lines.push(...data.items);
    lines.push('');
  }
  return lines.join('\n');
};

const cartSummary = (items) => {
  let total = 0;
  const lines = [];
  for (const item of items) {
    const sub = item.price * item.qty;
    total += sub;
    lines.push('• [' + (item.menuIdx || '') + '] ' + item.name + ' — R$ ' + fmtBRL(item.price) + ' × ' + item.qty + ' — R$ ' + fmtBRL(sub));
  }
  return { lines, total };
};

// Build options from DB tables
const deliveryOptions = () => orderTypes.map((t, i) => (i+1) + '️⃣ ' + t.label).join('\n');
const paymentOptions = (splitCount, hideMixed) => {
  let opts = paymentTypes.map((t, i) => (i+1) + '. ' + t.label).join('\n');
  if (!splitCount || splitCount < 2) opts += '\n' + (paymentTypes.length + 1) + '. 👥 Dividir entre pessoas';
  if (!hideMixed && paymentTypes.length > 1) opts += '\n' + (paymentTypes.length + 2) + '. 💰 Pagamento misto';
  return opts;
};
const nonCashOptions = () => paymentTypes
  .filter(t => t.name !== 'dinheiro')
  .map((t, i) => (i+1) + '. ' + t.label)
  .join('\n');

const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};


function validateName(raw) {
  const n = raw.trim();
  if (n.length < 2) return { valid: false, reason: 'short' };
  if (/\d/.test(n)) return { valid: false, reason: 'numbers' };
  if (!/^[\p{L}\s'\-]+$/u.test(n)) return { valid: false, reason: 'invalid_chars' };
  if (/^(.)\1{3,}$/u.test(n.replace(/\s/g, ''))) return { valid: false, reason: 'repeated' };
  const bad = ['merda','porra','caralho','buceta','viado','puta','fdp','cuzão','cuza','cuzao','fuder','foder','foda','arrombado','babaca','idiota','imbecil','cretino','otario','otário','lixo','vagabundo','vagabunda','piranha','safado','safada','desgraça','desgraca','bosta','pau','cacete','xoxota','pentelho','prostituta'];
  const lower = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  for (const w of bad) {
    const wn = w.normalize('NFD').replace(/[̀-ͯ]/g,'');
    if (lower === wn || lower.split(/\s+/).includes(wn)) return { valid: false, reason: 'bad_word' };
  }
  return { valid: true };
}
function parseTrocoInput(texto, amountToPay) {
  const t = texto.trim().toLowerCase().replace(',', '.');
  const m = t.match(/^([\d.]+)\s*(?:de\s*)?troco$/) || t.match(/^troco\s*(?:de\s*)?([\d.]+)$/);
  if (m) {
    const troco = parseFloat(m[1]);
    return isNaN(troco) ? null : amountToPay + troco;
  }
  const val = parseFloat(t);
  return isNaN(val) ? null : val;
}
function capitalizeName(n) { return n.trim().replace(/\b\p{L}/gu, c => c.toUpperCase()); }

const generateOrderCode = (phone) => {
  const n = new Date();
  const p = v => String(v).padStart(2, '0');
  return 'PED-' + n.getFullYear() + p(n.getMonth()+1) + p(n.getDate()) + p(n.getHours()) + p(n.getMinutes()) + p(n.getSeconds()) + '-' + phone.slice(-4);
};
const maybeAskOptIn = () => {
  if (marketingOptIn === null) {
    respostas.push(yesNo('📣 *Posso te enviar promoções e novidades?*'));
    newState = 'awaiting_marketing_opt_in';
  }
};
const buildRepeatOrderLines = (lastOrder, products, header) => {
  const items = lastOrder.items;
  const lines = [header + '\n'];
  let newTotal = 0;
  let hasChanges = false;
  const unavailable = [];

  for (const item of items) {
    const current = products.find(p => p.id === item.id);
    if (!current) {
      unavailable.push(item.name);
      continue;
    }
    const oldUnit = Number(item.price);
    const newUnit = Number(current.price);
    const newLine = newUnit * item.qty;
    newTotal += newLine;

    if (Math.abs(newUnit - oldUnit) >= 0.01) {
      hasChanges = true;
      const diff = newLine - (oldUnit * item.qty);
      const sign = diff > 0 ? '+' : '−';
      const icon = diff < 0 ? ' 🎉' : ' 📢';
      lines.push('• ' + item.name + ' × ' + item.qty + ' — *R$ ' + fmtBRL(newLine) + '*' + icon
        + '\n  _era R$ ' + fmtBRL(oldUnit * item.qty) + ' (' + sign + 'R$ ' + fmtBRL(Math.abs(diff)) + ')_');
    } else {
      lines.push('• ' + item.name + ' — R$ ' + fmtBRL(newUnit) + ' × ' + item.qty + ' — R$ ' + fmtBRL(newLine));
    }
  }

  if (unavailable.length > 0) {
    lines.push('\n⚠️ _Fora do cardápio: ' + unavailable.join(', ') + '_');
  }

  const oldTotal = Number(lastOrder.total);
  if (hasChanges && Math.abs(newTotal - oldTotal) >= 0.01) {
    const totalDiff = newTotal - oldTotal;
    const sign = totalDiff > 0 ? '+' : '−';
    lines.push('\n*Total: R$ ' + fmtBRL(newTotal) + '* _(' + sign + 'R$ ' + fmtBRL(Math.abs(totalDiff)) + ' vs último pedido)_');
  } else {
    lines.push('\n*Total: R$ ' + fmtBRL(newTotal) + '*');
  }
  return lines;
};

const yesNo = (body) => ({
  type: 'buttons', body,
  buttons: [{ id: 'sim', title: 'Sim ✅' }, { id: 'não', title: 'Não ❌' }]
});
const orderTypeBtn = () => ({
  type: 'buttons',
  body: 'Como deseja receber seu pedido?',
  buttons: orderTypes.filter(t=>t.active !== false).slice(0,3).map(t => ({ id: t.name, title: t.label }))
});
const paymentList = (splitCount, hideMixed) => {
  const rows = paymentTypes.map(t => ({ id: t.name, title: t.label }));
  if (!splitCount || splitCount < 2) rows.push({ id: 'dividir', title: '👥 Dividir entre pessoas' });
  if (!hideMixed && paymentTypes.length > 1) rows.push({ id: 'misto', title: '💰 Pagamento misto' });
  return { type: 'list', body: '💳 *Como vai pagar?*', button: 'Ver opções', sections: [{ title: 'Forma de Pagamento', rows }] };
};
const confirmBtn = (body) => ({ type: 'buttons', body, buttons: [{ id: 'sim', title: '✅ Confirmar' }, { id: 'não', title: '❌ Cancelar' }] });
const offerPickupBtn = (body) => ({ type: 'buttons', body, buttons: [{ id: 'sim', title: '✅ Sim, retirar' }, { id: 'não', title: '📍 Outro endereço' }] });
const notifBtn = (currentOptIn) => {
  const status = currentOptIn === true ? '🔔 *Notificações ativas*\nVocê recebe promoções e novidades.' : currentOptIn === false ? '🔕 *Notificações desativadas*\nVocê não recebe promoções.' : '🔔 *Notificações*\nConfigure suas preferências:';
  if (currentOptIn === true) return { type: 'buttons', body: status, buttons: [{ id: 'desativar', title: '🔕 Desativar' }, { id: '0', title: '↩️ Voltar' }] };
  return { type: 'buttons', body: status, buttons: [{ id: 'ativar', title: '🔔 Ativar' }, { id: '0', title: '↩️ Voltar' }] };
};
const categoryList = (context) => {
  if (!products || products.length === 0) return 'Cardápio temporariamente indisponível.';
  const cats = [...new Set(products.map(p => p.category || 'Outros'))];
  const prefix = context === 'order' ? 'order_cat:' : 'cat:';
  const rows = cats.map(c => {
    const its = products.filter(p => (p.category || 'Outros') === c);
    const catTitle = ((its[0]?.emoji || '🍽️') + ' ' + c).slice(0,24); return { id: prefix + c.toLowerCase(), title: catTitle, description: its.length + ' item(s)' };
  });
  const body = context === 'order' ? '🛒 *Fazer Pedido*\n\nEscolha uma categoria:' : '🍣 *Cardápio*\n\nEscolha uma categoria:';
  return { type: 'list', body, button: 'Ver categorias', sections: [{ title: 'Categorias', rows }] };
};
const itemsList = (categoryName, context, page) => {
  page = page || 0;
  const allItems = products.filter(p => (p.category || 'Outros') === categoryName);
  const PAGE_SIZE = 9;
  const start = page * PAGE_SIZE;
  const slice = allItems.slice(start, start + PAGE_SIZE);
  const hasMore = allItems.length > start + PAGE_SIZE;
  // Text menu — no 24-char limit, full product names
  const lines = ['🍽️ *' + categoryName + '*\n'];
  slice.forEach((p, i) => {
    const priceStr = 'R$ ' + fmtBRL(p.price);
    const descStr = p.description ? ' — _' + String(p.description).slice(0,60) + '_' : '';
    lines.push((start + i + 1) + '. ' + (p.emoji ? p.emoji + ' ' : '') + p.name + ' — ' + priceStr + descStr);
  });
  if (hasMore) lines.push('\n_Mais itens: responda *próxima* para ver a página ' + (page + 2) + '_');
  lines.push('\n_Digite o número do item ou *0* para voltar_');
  return { type: 'text_menu', body: lines.join('\n'), items: slice.map((p, i) => ({ num: start + i + 1, id: p.id, name: p.name })), categoryName, context, page, hasMore };
};
const qtyBtn = (productName) => ({ type: 'buttons', body: '🛒 *' + String(productName).slice(0,50) + '*\n\nQuantas unidades?', buttons: [{ id: 'qty:1', title: '1️⃣  1 unidade' }, { id: 'qty:2', title: '2️⃣  2 unidades' }, { id: 'qty:3', title: '3️⃣  3 unidades' }] });
const locationMsg = (lat, lng, name, address) => ({ type: 'location', latitude: lat, longitude: lng, name: name || 'Endereço de entrega', address: address || '' });
const greetings = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'inicio', 'menu', 'start', 'hello', 'hi'];

// Estados onde o usuário digita números/texto como INPUT (não como atalhos de menu)
const expectingRawInput = [
  'ordering_cat', 'browsing_categories',
  'ordering_items', 'browsing_items',
  'awaiting_qty', 'awaiting_more',
  'ordering'
].includes(currentState);

const restaurantTables = $json.restaurant_tables || [];
const upcomingReservations = $json.upcoming_reservations || [];
const parseDate = (text) => {
  const now = new Date();
  const t = text.toLowerCase();
  if (t.includes('hoje')) return now.toISOString().split('T')[0];
  if (t.includes('amanhã') || t.includes('amanha')) {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  const ddmm = t.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
  if (ddmm) {
    const day = parseInt(ddmm[1]), month = parseInt(ddmm[2]) - 1;
    const year = ddmm[3] ? parseInt(ddmm[3]) : now.getFullYear();
    const d = new Date(year, month, day);
    if (d <= now && !ddmm[3]) d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  }
  const dayMap = {'segunda':1,'terça':2,'terca':2,'quarta':3,'quinta':4,'sexta':5,'sábado':6,'sabado':6,'domingo':0};
  for (const [name, num] of Object.entries(dayMap)) {
    if (t.includes(name)) {
      const d = new Date(now);
      let diff = (num - d.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    }
  }
  return null;
};

const parseTime = (text) => {
  const m = text.match(/(\d{1,2})\s*[hH]\s*(\d{2})?|(\d{1,2}):(\d{2})/);
  if (!m) return null;
  if (m[1] !== undefined) return m[1].padStart(2,'0') + ':' + (m[2] || '00');
  return m[3].padStart(2,'0') + ':' + m[4];
};

const parsePeople = (text) => {
  const p1 = text.match(/para\s+(\d{1,2})\s*(?:pessoas?|pax)?/i);
  if (p1) { const n = parseInt(p1[1]); if (n>=1 && n<=30) return n; }
  const p2 = text.match(/(\d{1,2})\s*(?:pessoas?|pax|adultos?)/i);
  if (p2) { const n = parseInt(p2[1]); if (n>=1 && n<=30) return n; }
  return null;
};

const fmtDate = (iso) => iso ? iso.split('-').reverse().join('/') : '';
const fmtBRL = (n) => Number(n).toFixed(2).replace('.', ',');

// Notificar expiração apenas se havia fluxo em andamento
if (sessionWasReset && texto !== 'sair' && texto !== 'cancelar') {
  respostas.push('⏱️ _Sua sessão anterior expirou. Vamos começar do zero!_');
}
