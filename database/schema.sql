-- ============================================
-- Schema — Bot de Atendimento
-- PostgreSQL (self-hosted ou Supabase)
-- Convenção: snake_case inglês em tudo
-- Todas as tabelas: id, created_at, updated_at, deleted_at
-- ============================================

-- ============================================
-- Tabela de changelog / snapshot de alterações
-- ============================================
CREATE TABLE changelogs (
  id          BIGSERIAL PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   TEXT,
  action      TEXT NOT NULL,          -- INSERT | UPDATE | DELETE
  old_data    JSONB,
  new_data    JSONB,
  changed_by  TEXT DEFAULT 'system',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_changelogs_table  ON changelogs(table_name, record_id);
CREATE INDEX idx_changelogs_time   ON changelogs(created_at DESC);

-- ============================================
-- Função genérica de changelog (usada pelos triggers)
-- ============================================
CREATE OR REPLACE FUNCTION fn_changelog()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO changelogs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME,
            COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'phone'),
            'INSERT', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO changelogs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME,
            COALESCE(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'phone'),
            'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO changelogs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME,
            COALESCE(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'phone'),
            'DELETE', to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- tables (mesas)
-- ============================================
CREATE TABLE tables (
  id          SERIAL PRIMARY KEY,
  number      INT NOT NULL,
  capacity    INT NOT NULL,
  description TEXT,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- ============================================
-- categories (categorias de produtos/serviços)
-- ============================================
CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  emoji       TEXT DEFAULT '🍽️',
  description TEXT,
  sort_order  INT DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- ============================================
-- products (produtos/serviços)
-- ============================================
CREATE TABLE products (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  category_id  INT REFERENCES categories(id),
  price        DECIMAL(10,2) NOT NULL,
  available    BOOLEAN DEFAULT true,
  image_url    TEXT,
  attributes   JSONB DEFAULT '{}',
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- ============================================
-- payment_types (meios de pagamento)
-- ============================================
CREATE TABLE payment_types (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,   -- slug: pix | cartao | dinheiro
  type        TEXT NOT NULL,          -- digital | card | cash
  label       TEXT NOT NULL,          -- texto exibido ao cliente
  config      JSONB DEFAULT '{}',     -- {chave, nome} para pix, etc.
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

INSERT INTO payment_types (name, type, label, config) VALUES
  ('pix',      'digital', 'PIX',                    '{"chave":"","nome":""}'),
  ('cartao',   'card',    'Cartão (débito/crédito)', '{}'),
  ('dinheiro', 'cash',    'Dinheiro',                '{}');

-- ============================================
-- order_types (modalidades de entrega)
-- ============================================
CREATE TABLE order_types (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,   -- slug: delivery | retirada | mesa
  type        TEXT NOT NULL,          -- home_delivery | pickup | dine_in
  label       TEXT NOT NULL,          -- texto exibido ao cliente
  config      JSONB DEFAULT '{}',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

INSERT INTO order_types (name, type, label, active) VALUES
  ('delivery', 'home_delivery', 'Entregar 🛵',          true),
  ('retirada', 'pickup',        'Retirada no local 📤',  true),
  ('mesa',     'dine_in',       'Pedido na mesa 🍽️',   false);

-- ============================================
-- delivery_fee_rules (regras de taxa de entrega)
-- ============================================
CREATE TABLE delivery_fee_rules (
  id            SERIAL PRIMARY KEY,
  order_type_id INTEGER NOT NULL REFERENCES order_types(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL DEFAULT 'fixed'
                  CHECK (mode IN ('fixed','per_km','per_route_min','zones_km','zones_min')),
  base_fee      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  per_km_rate   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  per_min_rate  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  free_above    NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  max_radius_km NUMERIC(10,2) NOT NULL DEFAULT 10.00,
  active        BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ            DEFAULT now(),
  updated_at    TIMESTAMPTZ            DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

INSERT INTO delivery_fee_rules (order_type_id, mode, base_fee, per_km_rate, per_min_rate, free_above, max_radius_km)
SELECT id, 'fixed', 0.00, 2.00, 0.50, 0.00, 10.00 FROM order_types WHERE name = 'delivery';

-- ============================================
-- delivery_fee_zones (faixas por km ou minuto)
-- ============================================
CREATE TABLE delivery_fee_zones (
  id                   SERIAL PRIMARY KEY,
  delivery_fee_rule_id INTEGER NOT NULL REFERENCES delivery_fee_rules(id) ON DELETE CASCADE,
  zone_type            TEXT NOT NULL DEFAULT 'km' CHECK (zone_type IN ('km','min')),
  min_value            NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  max_value            NUMERIC(10,2) NOT NULL,
  fee                  NUMERIC(10,2) NOT NULL,
  label                TEXT,
  active               BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);

INSERT INTO delivery_fee_zones (delivery_fee_rule_id, zone_type, min_value, max_value, fee, label)
SELECT r.id, 'km',  0,  3,  5.00, 'Zona 1 — até 3 km'      FROM delivery_fee_rules r JOIN order_types o ON o.id = r.order_type_id WHERE o.name='delivery' UNION ALL
SELECT r.id, 'km',  3,  6,  8.00, 'Zona 2 — 3 a 6 km'      FROM delivery_fee_rules r JOIN order_types o ON o.id = r.order_type_id WHERE o.name='delivery' UNION ALL
SELECT r.id, 'km',  6, 10, 12.00, 'Zona 3 — 6 a 10 km'     FROM delivery_fee_rules r JOIN order_types o ON o.id = r.order_type_id WHERE o.name='delivery' UNION ALL
SELECT r.id, 'min', 0, 15,  5.00, 'Rápido — até 15 min'    FROM delivery_fee_rules r JOIN order_types o ON o.id = r.order_type_id WHERE o.name='delivery' UNION ALL
SELECT r.id, 'min',15, 30,  8.00, 'Médio — 15 a 30 min'    FROM delivery_fee_rules r JOIN order_types o ON o.id = r.order_type_id WHERE o.name='delivery' UNION ALL
SELECT r.id, 'min',30, 60, 12.00, 'Distante — 30 a 60 min' FROM delivery_fee_rules r JOIN order_types o ON o.id = r.order_type_id WHERE o.name='delivery';

-- ============================================
-- settings (configurações do estabelecimento)
-- ============================================
CREATE TABLE settings (
  id          SERIAL PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,
  value       TEXT NOT NULL,
  description TEXT,
  group_name  TEXT DEFAULT 'general',  -- general | schedule | messages | delivery
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

INSERT INTO settings (key, value, description, group_name) VALUES
  ('establishment_name',  'Sakura Restaurante',   'Nome exibido nas mensagens',                               'general'),
  ('opening_time',        '18:00',                'Horário de abertura (HH:MM)',                              'schedule'),
  ('closing_time',        '23:00',                'Horário de fechamento (HH:MM)',                            'schedule'),
  ('working_days',        'ter,qua,qui,sex,sab,dom', 'Dias da semana (seg,ter,qua,qui,sex,sab,dom)',          'schedule'),
  ('msg_closed',          E'Olá! No momento estamos fechados 🌙\n\nNosso horário de funcionamento:\nTer-Dom: 18h às 23h\n\nEm breve retornamos! 🌸', 'Mensagem fora do horário', 'messages'),
  ('msg_welcome',         'Olá! Bem-vindo ao Sakura 🌸', 'Primeira mensagem ao cliente',                     'messages'),
  ('min_order_value',     '30',                   'Valor mínimo do pedido em reais',                         'delivery'),
  ('prep_time_min',       '30',                   'Tempo médio de preparo em minutos',                       'general'),
  ('establishment_lat',   '0',                    'Latitude do estabelecimento',                             'delivery'),
  ('establishment_lng',   '0',                    'Longitude do estabelecimento',                            'delivery'),
  ('ignore_hours',        'false',                'Ignorar horário de funcionamento (true em dev/qa)',        'general'),
  ('evolution_api_key',   '',                     'API key da Evolution API',                                'general'),
  ('establishment_city',    'São Paulo, SP',        'Cidade do estabelecimento (usada para validar entregas)',  'delivery'),
  ('establishment_address', 'Rua Exemplo, 123 — São Paulo, SP', 'Endereço completo do estabelecimento (exibido ao cliente)', 'delivery'),
  ('kitchen_phone',            '',           'Número do celular da cozinha para notificações (ex: 5511999999999)', 'general'),
  ('session_ttl_min',          '60',         'Minutos de inatividade para expirar sessão (0 = nunca expira)',         'general'),
  ('reminder_interval_days',   '7',          'Dias desde o último pedido para enviar lembrete (0 = desativado)',      'general'),
  ('reminder_min_gap_days',    '7',          'Intervalo mínimo em dias entre dois lembretes/promoções ao mesmo cliente', 'general'),
  ('reminder_send_hour',       '12',         'Hora do dia (0-23) para disparar os lembretes',                        'general'),
  ('reminder_message_template','Olá, {name}! 😊 Faz {days} dias que você pediu {last_item}. Que saudade! Bora repetir? Digite *2* para pedir 🛒', 'Template do lembrete — variáveis: {name} {days} {last_item}', 'messages'),
  ('reservation_reminder_hour','10',          'Hora do dia (0-23) para disparar lembretes de reserva',               'general'),
  ('chatwoot_url',        'http://chatwoot:3000', 'URL interna do Chatwoot (dentro do Docker)',                         'integrations'),
  ('chatwoot_public_url', 'http://localhost:3010','URL pública do Chatwoot — link enviado ao agente',                   'integrations'),
  ('chatwoot_account_id', '',                     'ID da conta Chatwoot (Settings → Account)',                          'integrations'),
  ('chatwoot_api_token',  '',                     'Token do agente Chatwoot (Profile → Access Token)',                  'integrations'),
  ('chatwoot_inbox_id',   '',                     'ID do inbox WhatsApp no Chatwoot',                                   'integrations'),
  ('agent_phone',         '',                     'Número WhatsApp do atendente para receber o link (ex: 5511999999999)', 'integrations')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- faq
-- ============================================
CREATE TABLE faq (
  id          SERIAL PRIMARY KEY,
  category    TEXT,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  keywords    TEXT,
  active      BOOLEAN DEFAULT true,
  usage_count INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- ============================================
-- customers (clientes)
-- ============================================
CREATE TABLE customers (
  id                SERIAL PRIMARY KEY,
  phone             TEXT UNIQUE NOT NULL,
  name              TEXT,
  addresses         JSONB DEFAULT '[]',
  preferences       JSONB DEFAULT '{}',
  total_sessions    INT DEFAULT 0,
  total_spent       DECIMAL(10,2) DEFAULT 0,
  marketing_opt_in  BOOLEAN DEFAULT NULL,  -- NULL = not asked, true = opted in, false = opted out
  last_promo_at     TIMESTAMPTZ,           -- última vez que recebeu promoção ou lembrete
  first_session_at  TIMESTAMPTZ DEFAULT now(),
  last_session_at   TIMESTAMPTZ DEFAULT now(),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- ============================================
-- orders (pedidos)
-- ============================================
CREATE TABLE orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,
  customer_phone TEXT NOT NULL REFERENCES customers(phone),
  items          JSONB NOT NULL,
  subtotal       DECIMAL(10,2) NOT NULL,
  delivery_fee   DECIMAL(10,2) DEFAULT 0,
  discount       DECIMAL(10,2) DEFAULT 0,
  total          DECIMAL(10,2) NOT NULL,
  order_type     TEXT NOT NULL DEFAULT 'delivery' REFERENCES order_types(name),
  address        JSONB,
  table_id       INT REFERENCES tables(id),
  payment_method TEXT,                 -- pix | cartao | dinheiro | dividido: ... | misto: ...
  change_for     DECIMAL(10,2),        -- troco solicitado (apenas para pagamento em dinheiro)
  split_count    INT DEFAULT 0,        -- número de pessoas quando dividido
  split_payments JSONB,                -- [{person, label, change_for}] quando dividido por pessoa
  status           TEXT DEFAULT 'received', -- received | confirmed | preparing | ready | out_for_delivery | delivered | cancelled
  notified_status  TEXT DEFAULT NULL,        -- último status já notificado ao cliente via WhatsApp
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

-- ============================================
-- order_status_notifications (config de alertas por status)
-- ============================================
CREATE TABLE order_status_notifications (
  id               SERIAL PRIMARY KEY,
  status           TEXT NOT NULL UNIQUE,
  enabled          BOOLEAN NOT NULL DEFAULT true,
  message_template TEXT NOT NULL,    -- suporta {name}, {code}, {order_type}
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

INSERT INTO order_status_notifications (status, enabled, message_template) VALUES
  ('confirmed',        true, E'✅ *Pedido confirmado, {name}!*\n\n📦 Pedido *#{code}* foi confirmado e logo entrará em preparo.\n\n_Avisaremos quando estiver pronto!_ 🌸'),
  ('preparing',        true, E'👨‍🍳 *Seu pedido está sendo preparado!*\n\n📦 Pedido *#{code}* está na cozinha agora.\n\n_Em breve fica pronto!_ 🌸'),
  ('out_for_delivery', true, E'🛵 *Pedido saiu para entrega, {name}!*\n\n📦 Pedido *#{code}* está a caminho.\n\n_Fique de olho — nosso entregador já está na rota!_ 🌸'),
  ('ready',            true, E'✅ *Seu pedido está pronto, {name}!*\n\n📦 Pedido *#{code}* está pronto.\n\n_Pode vir buscar!_ 🌸'),
  ('delivered',        true, E'🎉 *Pedido entregue, {name}!*\n\n📦 Pedido *#{code}* foi entregue.\n\nObrigado pela preferência! Esperamos te ver em breve. 🌸'),
  ('cancelled',        true, E'❌ *Pedido cancelado*\n\nInfelizmente o pedido *#{code}* foi cancelado.\n\nSe tiver dúvidas, responda esta mensagem e um atendente irá te ajudar.')
ON CONFLICT (status) DO NOTHING;

-- ============================================
-- order_status_logs (histórico de status do pedido)
-- ============================================
CREATE TABLE order_status_logs (
  id         SERIAL PRIMARY KEY,
  order_id   UUID REFERENCES orders(id),
  status     TEXT NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ============================================
-- reservations (reservas de mesa)
-- ============================================
CREATE TABLE reservations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,
  customer_phone TEXT NOT NULL REFERENCES customers(phone),
  table_id       INT REFERENCES tables(id),
  date           DATE NOT NULL,
  time           TIME NOT NULL,
  party_size     INT NOT NULL,
  status              TEXT DEFAULT 'pending',  -- pending | confirmed | cancelled | completed | no_show
  notes               TEXT,
  reminder_1day_sent  BOOLEAN NOT NULL DEFAULT false,
  reminder_day_sent   BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

-- ============================================
-- reservation_status_logs
-- ============================================
CREATE TABLE reservation_status_logs (
  id             SERIAL PRIMARY KEY,
  reservation_id UUID REFERENCES reservations(id),
  status         TEXT NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

-- ============================================
-- sessions (sessões de conversa — estado do bot)
-- ============================================
CREATE TABLE sessions (
  phone                    TEXT PRIMARY KEY,
  state                    TEXT DEFAULT 'start',
  cart                     JSONB DEFAULT '{}',
  temp_data                JSONB DEFAULT '{}',
  reservation_temp         JSONB DEFAULT '{}',
  chatwoot_conversation_id TEXT,
  last_activity_at         TIMESTAMPTZ DEFAULT now(),
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);

-- ============================================
-- question_logs (log de perguntas feitas à IA)
-- ============================================
CREATE TABLE question_logs (
  id                   SERIAL PRIMARY KEY,
  customer_phone       TEXT,
  question             TEXT NOT NULL,
  ai_response          TEXT,
  confidence           TEXT,           -- high | medium | low
  transferred_to_human BOOLEAN DEFAULT false,
  became_faq           BOOLEAN DEFAULT false,
  faq_id               INT REFERENCES faq(id),
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);

-- ============================================
-- Função de geolocalização (haversine)
-- ============================================
CREATE OR REPLACE FUNCTION calculate_distance_km(
  lat1 FLOAT, lon1 FLOAT,
  lat2 FLOAT, lon2 FLOAT
) RETURNS FLOAT AS $$
BEGIN
  RETURN 6371 * acos(
    LEAST(1.0,
      cos(radians(lat1)) * cos(radians(lat2)) *
      cos(radians(lon2) - radians(lon1)) +
      sin(radians(lat1)) * sin(radians(lat2))
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- promotions (promoções agendadas para envio em massa)
-- ============================================
CREATE TABLE promotions (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at      TIMESTAMPTZ,
  target       TEXT DEFAULT 'all',  -- all | opted_in
  status       TEXT DEFAULT 'pending',  -- pending | sending | sent | cancelled
  sent_count   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- ============================================
-- Índices
-- ============================================
CREATE INDEX idx_orders_customer    ON orders(customer_phone);
CREATE INDEX idx_orders_status      ON orders(status);
CREATE INDEX idx_orders_created     ON orders(created_at DESC);
CREATE INDEX idx_orders_active      ON orders(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_reservations_cust  ON reservations(customer_phone);
CREATE INDEX idx_reservations_date  ON reservations(date, time);
CREATE INDEX idx_reservations_stat  ON reservations(status);
CREATE INDEX idx_questions_created  ON question_logs(created_at DESC);
CREATE INDEX idx_questions_human    ON question_logs(transferred_to_human) WHERE transferred_to_human = true;
CREATE INDEX idx_products_avail     ON products(available) WHERE available = true;
CREATE INDEX idx_products_cat       ON products(category_id);
CREATE INDEX idx_payment_active     ON payment_types(active) WHERE active = true AND deleted_at IS NULL;
CREATE INDEX idx_ordertype_active   ON order_types(active) WHERE active = true AND deleted_at IS NULL;
CREATE INDEX idx_customers_mktg     ON customers(marketing_opt_in) WHERE marketing_opt_in = true AND deleted_at IS NULL;
CREATE INDEX idx_promotions_sched   ON promotions(scheduled_at) WHERE status = 'pending' AND deleted_at IS NULL;

-- ============================================
-- Changelog triggers (ordens, clientes, reservas, catálogo, settings)
-- Captura INSERT + UPDATE + DELETE em todas as tabelas críticas
-- ============================================
CREATE TRIGGER tr_orders_changelog
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

CREATE TRIGGER tr_customers_changelog
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

CREATE TRIGGER tr_reservations_changelog
  AFTER INSERT OR UPDATE OR DELETE ON reservations
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

CREATE TRIGGER tr_products_changelog
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

CREATE TRIGGER tr_payment_types_changelog
  AFTER INSERT OR UPDATE OR DELETE ON payment_types
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

CREATE TRIGGER tr_order_types_changelog
  AFTER INSERT OR UPDATE OR DELETE ON order_types
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

CREATE TRIGGER tr_settings_changelog
  AFTER INSERT OR UPDATE OR DELETE ON settings
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

-- ============================================
-- Views
-- ============================================
CREATE VIEW available_tables AS
SELECT t.id, t.number, t.capacity, t.description
FROM tables t
WHERE t.active = true AND t.deleted_at IS NULL
  AND t.id NOT IN (
    SELECT table_id FROM reservations
    WHERE status IN ('pending','confirmed') AND table_id IS NOT NULL
  );

CREATE VIEW reservations_today AS
SELECT r.code, c.name AS customer_name, r.customer_phone,
       t.number AS table_number, r.time, r.party_size, r.status, r.notes
FROM reservations r
JOIN customers c ON c.phone = r.customer_phone
LEFT JOIN tables t ON t.id = r.table_id
WHERE r.date = CURRENT_DATE AND r.deleted_at IS NULL
ORDER BY r.time;

CREATE VIEW pending_faqs AS
SELECT question,
       COUNT(*) AS times_asked,
       COUNT(*) FILTER (WHERE transferred_to_human = true) AS escalated,
       MAX(created_at) AS last_asked_at
FROM question_logs
WHERE became_faq = false AND deleted_at IS NULL
GROUP BY question
ORDER BY times_asked DESC;

CREATE VIEW weekly_report AS
SELECT question,
       COUNT(*) AS total,
       ROUND(COUNT(*) FILTER (WHERE transferred_to_human = true) * 100.0 / COUNT(*), 0) AS pct_escalated
FROM question_logs
WHERE created_at >= now() - INTERVAL '7 days'
  AND became_faq = false AND deleted_at IS NULL
GROUP BY question
HAVING COUNT(*) >= 3
ORDER BY total DESC;
