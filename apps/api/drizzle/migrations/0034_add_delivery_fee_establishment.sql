ALTER TABLE "delivery_fee_rules" ADD COLUMN IF NOT EXISTS "establishment_id" uuid REFERENCES "establishments"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "delivery_fee_zones" ADD COLUMN IF NOT EXISTS "establishment_id" uuid REFERENCES "establishments"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- Regra de taxa nasceu do schema legado do bot, sem tenant. Enquanto houver um
-- único estabelecimento a atribuição é inequívoca; com mais de um, as regras
-- ficam sem dono e precisam de decisão humana, não de um chute da migration.
UPDATE "delivery_fee_rules" SET "establishment_id" = (SELECT "id" FROM "establishments")
WHERE "establishment_id" IS NULL AND (SELECT COUNT(*) FROM "establishments") = 1;
--> statement-breakpoint
UPDATE "delivery_fee_zones" SET "establishment_id" = (SELECT "id" FROM "establishments")
WHERE "establishment_id" IS NULL AND (SELECT COUNT(*) FROM "establishments") = 1;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_fee_rules_establishment_idx" ON "delivery_fee_rules" ("establishment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_fee_zones_establishment_idx" ON "delivery_fee_zones" ("establishment_id");
