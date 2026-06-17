#!/usr/bin/env bash
# Seed database with categorias.csv, produtos.csv and faq.csv
# Usage: ./scripts/seed-db.sh

set -euo pipefail

DB_USER="${POSTGRES_USER:-botuser}"
DB_NAME="${POSTGRES_DB:-botdb}"
DATA_DIR="$(dirname "$0")/../dados"

# Try to load from .env if present
ENV_FILE="$(dirname "$0")/../infra/.env"
if [ -f "$ENV_FILE" ]; then
  DB_USER=$(grep -s ^POSTGRES_USER "$ENV_FILE" | cut -d= -f2 || echo "$DB_USER")
  DB_NAME=$(grep -s ^POSTGRES_DB "$ENV_FILE" | cut -d= -f2 || echo "$DB_NAME")
fi

echo "Populando banco $DB_NAME com dados iniciais..."

# Wait for postgres
for i in $(seq 1 20); do
  if docker exec postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  echo "  Aguardando PostgreSQL... ($i/20)"
  sleep 3
done

# Check if already seeded
COUNT=$(docker exec postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT COUNT(*) FROM produtos;" 2>/dev/null || echo "0")

if [ "$COUNT" -gt 0 ]; then
  echo "  Produtos já tem $COUNT itens — pulando seed"
  exit 0
fi

# Import categorias
if [ -f "$DATA_DIR/categorias.csv" ]; then
  echo "  Importando categorias.csv..."
  docker exec -i postgres psql -U "$DB_USER" -d "$DB_NAME" \
    -c "TRUNCATE categorias RESTART IDENTITY CASCADE;" >/dev/null
  docker exec -i postgres psql -U "$DB_USER" -d "$DB_NAME" \
    -c "\COPY categorias (id,nome,emoji,descricao,ordem,ativa) FROM STDIN WITH (FORMAT csv, HEADER true)" \
    < "$DATA_DIR/categorias.csv"
  # Reset sequence after explicit id insert
  docker exec -i postgres psql -U "$DB_USER" -d "$DB_NAME" \
    -c "SELECT setval('categorias_id_seq', (SELECT MAX(id) FROM categorias));" >/dev/null
  echo "  Categorias importadas."
fi

# Import produtos
if [ -f "$DATA_DIR/produtos.csv" ]; then
  echo "  Importando produtos.csv..."
  docker exec -i postgres psql -U "$DB_USER" -d "$DB_NAME" \
    -c "TRUNCATE produtos RESTART IDENTITY CASCADE;" >/dev/null
  docker exec -i postgres psql -U "$DB_USER" -d "$DB_NAME" \
    -c "\COPY produtos (id,nome,descricao,categoria_id,preco,disponivel,imagem_url,atributos,observacoes) FROM STDIN WITH (FORMAT csv, HEADER true, DELIMITER ',', QUOTE '\"', ESCAPE '\"')" \
    < "$DATA_DIR/produtos.csv"
  docker exec -i postgres psql -U "$DB_USER" -d "$DB_NAME" \
    -c "SELECT setval('produtos_id_seq', (SELECT MAX(id) FROM produtos));" >/dev/null
  echo "  Produtos importados."
fi

# Import faq
if [ -f "$DATA_DIR/faq.csv" ]; then
  echo "  Importando faq.csv..."
  docker exec -i postgres psql -U "$DB_USER" -d "$DB_NAME" \
    -c "TRUNCATE faq RESTART IDENTITY CASCADE;" >/dev/null
  docker exec -i postgres psql -U "$DB_USER" -d "$DB_NAME" \
    -c "\COPY faq (id,categoria,pergunta,resposta,palavras_chave,ativo) FROM STDIN WITH (FORMAT csv, HEADER true, DELIMITER ',')" \
    < "$DATA_DIR/faq.csv"
  echo "  FAQ importado."
fi

echo "Seed concluído."
