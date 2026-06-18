#!/usr/bin/env node
/**
 * Testes end-to-end do fluxo de conversa.
 * Simula a máquina de estados do nó "Rotear e Responder"
 * sem precisar do n8n, WhatsApp ou banco de dados.
 */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ── Dados de teste ─────────────────────────────────────────────────────────
const PRODUCTS = [
  { id: 1, name: 'Temaki Salmão',          category: 'Temaki',   price: 23.90, emoji: '🌯' },
  { id: 2, name: 'Temaki Atum',            category: 'Temaki',   price: 25.90, emoji: '🌯' },
  { id: 3, name: 'Temaki Philadelphia',    category: 'Temaki',   price: 27.90, emoji: '🌯' },
  { id: 4, name: 'Temaki Camarão Grelhado',category: 'Temaki',   price: 28.90, emoji: '🌯' },
  { id: 5, name: 'Hot Roll Salmão (8 un)', category: 'Hot Roll', price: 39.90, emoji: '🔥' },
  { id: 6, name: 'Hot Roll Camarão (8 un)',category: 'Hot Roll', price: 43.90, emoji: '🔥' },
  { id: 7, name: 'Hot Roll Atum (8 un)',   category: 'Hot Roll', price: 41.90, emoji: '🔥' },
];

const CONFIG = {
  establishment_name: 'Sakura',
  opening_time: '18:00',
  closing_time: '23:00',
  working_days: 'seg,ter,qua,qui,sex,sab,dom',
  msg_welcome: 'Olá! Bem-vindo ao Sakura 🌸',
  ignore_hours: 'true',
  session_ttl_min: '60',
  establishment_lat: '-21.8',
  establishment_lng: '-47.8',
  establishment_city: 'Ribeirão Preto, SP',
  min_order_value: '0',
  kitchen_phone: '5516999999999',
};

const PAYMENT_TYPES = [
  { name: 'pix',     label: 'PIX',            active: true, config: { chave: '11999999999', nome: 'Sakura' } },
  { name: 'credito', label: 'Cartão Crédito', active: true },
  { name: 'dinheiro',label: 'Dinheiro',       active: true },
];

const ORDER_TYPES = [
  { name: 'delivery', label: '🚗 Delivery',          active: true },
  { name: 'retirada', label: '📤 Retirada no local', active: true },
];

// ── Carregar jsCode do workflow ────────────────────────────────────────────
const wfPath = path.join(__dirname, '../n8n/workflows/01-receber-mensagem.json');
const wf     = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
const roteadorNode = wf.nodes.find(n => n.name === 'Rotear e Responder');
if (!roteadorNode) { console.error('Node "Rotear e Responder" não encontrado'); process.exit(1); }
const RAW_CODE = roteadorNode.parameters.jsCode;

// ── Executor: simula uma mensagem e retorna o resultado ───────────────────
function runMessage({ texto, state = 'start', cart = null, customerName = 'Anderson', lastOrder = null }) {
  const session = {
    state,
    cart: cart || { items: [], order_type: '', address: '', complement: '',
      delivery_fee: 0, payment_method: '', change_for: null,
      split_count: 0, split_current: 0, split_payments: [],
      mixed_method: '', mixed_label: '', mixed_amount: 0,
      address_street_temp: null, browse_category: '', browse_page: 0,
      pending_item_id: null, pending_item_name: '' },
    last_activity_at: new Date().toISOString(),
  };

  // Mock $json (saída do Buscar Dados)
  const jsonData = {
    config: CONFIG,
    products: PRODUCTS,
    payment_types: PAYMENT_TYPES,
    order_types: ORDER_TYPES,
    session,
    last_order: lastOrder,
    recent_orders: [],
    restaurant_tables: [],
    upcoming_reservations: [],
    delivery_fee_rule: { mode: 'fixed', base_fee: 5, free_above: 0, max_radius_km: 10, zones: [] },
    customer_name: customerName,
    marketing_opt_in: null,
  };

  // Mock $() para "Calcular Hora"
  const calcHoraData = {
    tel: '5511999999999',
    instancia: 'test',
    texto: texto.toLowerCase().trim(),
    horaAtual: '19:00',
    diaSemana: 'seg',
    location_lat: null,
    location_lng: null,
    push_name: customerName || '',
  };

  // Adaptação: o código usa this.helpers.httpRequest (async)
  // Mockar como função que retorna imediatamente
  const mockHelpers = {
    httpRequest: async () => ({ routes: [{ distance: 3000, duration: 600 }] }),
  };

  // Wrap do código em async function para suportar await
  const wrappedCode = `
    (async function(__jsonData, __calcHoraData, __helpers) {
      // Mock das globals do n8n
      const $json = __jsonData;
      const $ = (nodeName) => ({ first: () => ({ json: __calcHoraData }) });
      const self = { helpers: __helpers };
      // Bind 'this' para httpRequest
      const origCode = async function() {
        ${RAW_CODE}
      };
      return origCode.call(self);
    })
  `;

  try {
    const fn = vm.runInNewContext(wrappedCode, {
      console, JSON, Date, Math, Array, Object, String, Number, Boolean,
      parseInt, parseFloat, isNaN, encodeURIComponent, Promise,
      setTimeout: (fn, ms) => fn(), // stub
    });
    // Run synchronously via a trick: we get the promise
    let result;
    let error;
    fn(jsonData, calcHoraData, mockHelpers).then(r => { result = r; }).catch(e => { error = e; });
    // Node.js microtask queue — drain it
    // Since we mocked all async calls to resolve immediately, this works
    return { result, error };
  } catch (e) {
    return { result: null, error: e };
  }
}

// ── Utilitários de teste ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertState(result, expectedState) {
  const actual = result?.[0]?.json?.state;
  assert(actual === expectedState, `Estado esperado: '${expectedState}', recebido: '${actual}'`);
}

function assertResponseContains(result, text) {
  const resps = result?.[0]?.json?.respostas || [];
  const found = resps.some(r => {
    const body    = typeof r === 'string' ? r : (r?.body || '');
    const buttons = (r?.buttons || []).map(b => b.title || b.id || '').join(' ');
    const rows    = (r?.sections || []).flatMap(s => s.rows || []).map(row => row.title + ' ' + (row.description || '')).join(' ');
    return (body + ' ' + buttons + ' ' + rows).includes(text);
  });
  assert(found, `Resposta não contém "${text}". Respostas: ${JSON.stringify(resps).slice(0, 300)}`);
}

function assertResponseType(result, type) {
  const resps = result?.[0]?.json?.respostas || [];
  const found = resps.some(r => typeof r === 'object' && r?.type === type);
  assert(found, `Nenhuma resposta do tipo '${type}'. Tipos: ${resps.map(r => typeof r === 'object' ? r?.type : 'string').join(', ')}`);
}

function assertNoObjectObject(result) {
  const resps = result?.[0]?.json?.respostas || [];
  resps.forEach((r, i) => {
    const body = typeof r === 'string' ? r : (r?.body || '');
    assert(!body.includes('[object Object]'), `Resposta[${i}] contém [object Object]: ${body.slice(0,100)}`);
  });
}

// ── Execução síncrona simples para testes ─────────────────────────────────
// Node.js permite rodar Promises de forma síncrona via async IIFE
async function runTests() {
  const exec = (args) => {
    return new Promise((resolve) => {
      const jsonData = {
        config: CONFIG,
        products: PRODUCTS,
        payment_types: PAYMENT_TYPES,
        order_types: ORDER_TYPES,
        session: {
          state: args.state || 'start',
          cart: args.cart || {
            items: [], order_type: '', address: '', complement: '',
            delivery_fee: 0, payment_method: '', change_for: null,
            split_count: 0, split_current: 0, split_payments: [],
            mixed_method: '', mixed_label: '', mixed_amount: 0,
            address_street_temp: null, browse_category: args.browse_category || '',
            browse_page: 0, pending_item_id: args.pending_item_id || null,
            pending_item_name: args.pending_item_name || '',
          },
          reservation_temp: args.reservation_temp || {},
          last_activity_at: new Date().toISOString(),
        },
        last_order: args.lastOrder || null,
        recent_orders: [],
        restaurant_tables: [{ id: 1, number: 1, capacity: 4 }],
        upcoming_reservations: [],
        delivery_fee_rule: { mode: 'fixed', base_fee: 5, free_above: 0, max_radius_km: 10, zones: [] },
        customer_name: args.customerName !== undefined ? args.customerName : 'Anderson',
        marketing_opt_in: args.marketing_opt_in !== undefined ? args.marketing_opt_in : null,
      };

      const calcHoraData = {
        tel: '5511999999999',
        instancia: 'test',
        texto: (args.texto || '').toLowerCase().trim(),
        horaAtual: '19:00',
        diaSemana: 'seg',
        location_lat: args.location_lat || null,
        location_lng: args.location_lng || null,
        push_name: args.customerName || '',
      };

      const mockHelpers = {
        httpRequest: async (opts) => {
          if (opts?.url?.includes('viacep')) return { cep: '14403-380', logradouro: 'Av Presidente Vargas', bairro: 'Centro', localidade: 'Franca', uf: 'SP' };
          if (opts?.url?.includes('nominatim') && opts?.url?.includes('search')) return [{ lat: '-20.5', lon: '-47.4', display_name: 'Av Presidente Vargas, Franca, SP' }];
          if (opts?.url?.includes('nominatim') && opts?.url?.includes('reverse')) return { address: { road: 'Av Presidente Vargas', house_number: '123', city: 'Franca', state_code: 'SP' } };
          if (opts?.url?.includes('osrm')) return { routes: [{ distance: 3000, duration: 600 }] };
          return {};
        },
      };

      const wrappedCode = `(async function(__json, __calcHora, __helpers) {
        const $json = __json;
        const $ = () => ({ first: () => ({ json: __calcHora }) });
        ${RAW_CODE}
      })`;

      const fn = vm.runInNewContext(wrappedCode, {
        console, JSON, Date, Math, Array, Object, String, Number, Boolean,
        parseInt, parseFloat, isNaN, encodeURIComponent, Promise,
        setTimeout: (fn) => fn(),
      });

      fn(jsonData, calcHoraData, mockHelpers).then(resolve).catch(e => resolve(null, e));
    });
  };

  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n🧪 Testes de Fluxo — Sakura Bot\n');

  // ── GRUPO 1: Entrada e menu ─────────────────────────────────────────────
  console.log('── Entrada e menu');

  await test('saudação → welcome + menu (3 botões)', async () => {
    const r = await exec({ texto: 'oi' });
    assertState(r, 'start');
    assertResponseType(r, 'buttons');
    assertNoObjectObject(r);
  });

  await test('saudação sem nome → pede nome (awaiting_name)', async () => {
    const r = await exec({ texto: 'oi', customerName: null });
    assertState(r, 'awaiting_name');
    assertResponseContains(r, 'nome');
    assertNoObjectObject(r);
  });

  await test('saudação com pedido anterior → pergunta repetir (repeat_order)', async () => {
    const r = await exec({ texto: 'oi', lastOrder: {
      items: [{ id: 1, name: 'Temaki Salmão', price: 23.90, qty: 2 }], total: 47.80
    }});
    assertState(r, 'repeat_order');
    assertResponseType(r, 'buttons');
    assertNoObjectObject(r);
  });

  // ── GRUPO 2: Falha crítica — números interceptados fora do fluxo ────────
  console.log('\n── Interceptação de números (bug crítico)');

  await test('[BUG FIX] digitar "1" em ordering_items NÃO vai para cardápio', async () => {
    const r = await exec({
      texto: '1',
      state: 'ordering_items',
      browse_category: 'Temaki',
    });
    // Estado deve ser awaiting_qty (selecionou item 1), não ordering_cat
    assertState(r, 'awaiting_qty');
    assertNoObjectObject(r);
  });

  await test('[BUG FIX] digitar "2" em ordering_items NÃO vai para fazer pedido', async () => {
    const r = await exec({
      texto: '2',
      state: 'ordering_items',
      browse_category: 'Temaki',
    });
    assertState(r, 'awaiting_qty');
    assertNoObjectObject(r);
  });

  await test('[BUG FIX] digitar "4" em awaiting_qty NÃO vai para atendente', async () => {
    const r = await exec({
      texto: '4',
      state: 'awaiting_qty',
      pending_item_id: 1,
      pending_item_name: 'Temaki Salmão',
    });
    // Deve interpretar "4" como quantidade
    assertState(r, 'awaiting_more');
    assertNoObjectObject(r);
  });

  await test('[BUG FIX] digitar "3" em ordering_items seleciona item 3 (não reservar)', async () => {
    const r = await exec({
      texto: '3',
      state: 'ordering_items',
      browse_category: 'Temaki',
    });
    assertState(r, 'awaiting_qty');
    assertNoObjectObject(r);
  });

  // ── GRUPO 3: Fluxo de navegação de categorias ────────────────────────────
  console.log('\n── Navegação de categorias');

  await test('botão "🛒 Fazer Pedido" → lista de categorias', async () => {
    const r = await exec({ texto: '2', state: 'start' });
    assertState(r, 'ordering_cat');
    assertResponseType(r, 'list');
    assertNoObjectObject(r);
  });

  await test('selecionar categoria Temaki → lista de itens (text_menu)', async () => {
    const r = await exec({ texto: 'order_cat:temaki', state: 'ordering_cat' });
    assertState(r, 'ordering_items');
    assertResponseContains(r, 'Temaki Salmão');
    assertNoObjectObject(r);
  });

  await test('texto "0" em ordering_items → volta para categorias', async () => {
    const r = await exec({ texto: '0', state: 'ordering_items', browse_category: 'Temaki' });
    assertState(r, 'ordering_cat');
    assertNoObjectObject(r);
  });

  // ── GRUPO 4: Seleção e quantidade ────────────────────────────────────────
  console.log('\n── Seleção de item e quantidade');

  await test('número válido em ordering_items → botões de quantidade', async () => {
    const r = await exec({ texto: '1', state: 'ordering_items', browse_category: 'Temaki' });
    assertState(r, 'awaiting_qty');
    assertResponseType(r, 'buttons');
    assertResponseContains(r, 'Adicionar');
    assertNoObjectObject(r);
  });

  await test('qty:1 (botão) → item adicionado ao carrinho', async () => {
    const r = await exec({
      texto: 'qty:1',
      state: 'awaiting_qty',
      pending_item_id: 1,
      pending_item_name: 'Temaki Salmão',
    });
    assertState(r, 'awaiting_more');
    assertResponseContains(r, 'adicionado');
    assertNoObjectObject(r);
    const cart = r?.[0]?.json?.cart;
    assert(cart?.items?.length === 1, 'Carrinho deve ter 1 item');
    assert(cart.items[0].qty === 1, 'Quantidade deve ser 1');
  });

  await test('digitar "3" como qtd → 3 unidades adicionadas', async () => {
    const r = await exec({
      texto: '3',
      state: 'awaiting_qty',
      pending_item_id: 1,
      pending_item_name: 'Temaki Salmão',
    });
    assertState(r, 'awaiting_more');
    const cart = r?.[0]?.json?.cart;
    assert(cart?.items?.[0]?.qty === 3, `Qtd esperada: 3, recebida: ${cart?.items?.[0]?.qty}`);
    assertNoObjectObject(r);
  });

  await test('qty:more → pede número (texto simples)', async () => {
    const r = await exec({
      texto: 'qty:more',
      state: 'awaiting_qty',
      pending_item_id: 1,
      pending_item_name: 'Temaki Salmão',
    });
    // Deve permanecer em awaiting_qty e pedir a qtd
    assertState(r, 'awaiting_qty');
    assertResponseContains(r, 'Quantas');
    assertNoObjectObject(r);
  });

  await test('item:back → volta para lista de itens', async () => {
    const r = await exec({
      texto: 'item:back',
      state: 'awaiting_qty',
      pending_item_id: 1,
      pending_item_name: 'Temaki Salmão',
      browse_category: 'Temaki',
    });
    assertState(r, 'ordering_items');
    assertResponseContains(r, 'Temaki');
    assertNoObjectObject(r);
  });

  // ── GRUPO 5: Carrinho e finalização ──────────────────────────────────────
  console.log('\n── Carrinho e finalização');

  const cartWithItem = {
    items: [{ id: 1, name: 'Temaki Salmão', qty: 2, price: 23.90, menuIdx: 1 }],
    order_type: '', address: '', complement: '', delivery_fee: 0,
    payment_method: '', change_for: null, split_count: 0, split_current: 0,
    split_payments: [], mixed_method: '', mixed_label: '', mixed_amount: 0,
    address_street_temp: null, browse_category: 'Temaki', browse_page: 0,
    pending_item_id: null, pending_item_name: '',
  };

  await test('finalizar → resumo com confirmBtn', async () => {
    const r = await exec({ texto: 'finalizar', state: 'ordering', cart: cartWithItem });
    assertState(r, 'confirming');
    assertResponseType(r, 'buttons');
    assertResponseContains(r, 'R$ 47,80');  // 23.90 × 2
    assertNoObjectObject(r);
  });

  await test('confirmar → pede tipo de entrega', async () => {
    const r = await exec({ texto: 'sim', state: 'confirming', cart: cartWithItem });
    assertState(r, 'awaiting_type');
    assertResponseType(r, 'buttons');
    assertNoObjectObject(r);
  });

  await test('retirada → pede pagamento diretamente', async () => {
    const r = await exec({ texto: 'retirada', state: 'awaiting_type', cart: { ...cartWithItem, order_type: '' } });
    assertState(r, 'awaiting_payment');
    assertResponseType(r, 'list');
    assertNoObjectObject(r);
  });

  // ── GRUPO 6: Formatação de moeda ─────────────────────────────────────────
  console.log('\n── Formatação de moeda');

  await test('preços usam vírgula como separador decimal (R$ 23,90)', async () => {
    const r = await exec({ texto: '1', state: 'ordering_items', browse_category: 'Temaki' });
    assertResponseContains(r, 'R$ 23,90');
    assertNoObjectObject(r);
    // Garantir que não tem ponto decimal americano nos preços visíveis
    const resps = r?.[0]?.json?.respostas || [];
    resps.forEach((resp, i) => {
      const body = typeof resp === 'string' ? resp : (resp?.body || '');
      const americanPrice = body.match(/R\$ \d+\.\d{2}/);
      assert(!americanPrice, `Resposta[${i}] usa formato americano: ${americanPrice?.[0]}`);
    });
  });

  // ── GRUPO 7: Repeat order ────────────────────────────────────────────────
  console.log('\n── Pedido repetido');

  await test('sim no repeat_order → itens carregados no carrinho', async () => {
    const r = await exec({
      texto: 'sim',
      state: 'repeat_order',
      lastOrder: { items: [{ id: 1, name: 'Temaki Salmão', price: 23.90, qty: 2 }], total: 47.80 },
    });
    assertState(r, 'ordering');
    const cart = r?.[0]?.json?.cart;
    assert(cart?.items?.length === 1, 'Carrinho deve ter 1 item do pedido anterior');
    assertNoObjectObject(r);
  });

  await test('não no repeat_order → vai para menu principal', async () => {
    const r = await exec({ texto: 'não', state: 'repeat_order' });
    assertState(r, 'start');
    assertResponseType(r, 'buttons');
    assertNoObjectObject(r);
  });

  // ── RESULTADO ─────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  const total = passed + failed;
  if (failed === 0) {
    console.log(`✅ ${passed}/${total} testes passaram`);
  } else {
    console.log(`❌ ${failed}/${total} testes falharam, ${passed} passaram`);
    process.exit(1);
  }
}

runTests().catch(e => { console.error(e); process.exit(1); });
