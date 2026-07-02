-- RLS Slice 2 — Enforcement auf den Wurzel-Entitäten (ADR 0004): tenantId wird
-- Pflichtfeld mit Default 'tenant_texma' (hält alle bestehenden INSERTs grün; der
-- Default fällt in Slice 4, wenn tenantId bei echter Multi-Tenant-Anlage überall
-- explizit gesetzt wird), danach ENABLE ROW LEVEL SECURITY + Policy je Tabelle.
--
-- Pflicht-Detail Performance (F12/InitPlan): current_setting MUSS als Skalar-
-- Subquery `(SELECT …)` gewrappt sein — Postgres evaluiert sie dann EINMAL pro
-- Query (InitPlan) statt pro Zeile (~18× Unterschied, Benchmark in ADR 0004).
--
-- BEWUSST KEIN `FORCE ROW LEVEL SECURITY` (Slice-2-Schnitt, ADR 0004 Slice 4):
-- der Owner-Bypass (Migrations-/Owner-Rolle `texma`, Research F13) hält Dev,
-- Migrationen und Seed grün — das Enforcement gilt für die Laufzeit-Rolle
-- `texma_app` (packages/db/sql/runtime-role.sql, DATABASE_URL_RUNTIME).
-- FORCE (Defense-in-Depth auch gegen den Owner) folgt in Slice 4.
--
-- Fail-closed: current_setting('app.tenant_id', true) liefert NULL, wenn der
-- Tenant-Kontext fehlt → der Vergleich ist NULL → texma_app sieht 0 Zeilen.

-- ── User ─────────────────────────────────────────────────────────────────────
-- Backfill kam in 0121; zur Sicherheit erneut (idempotent), bevor NOT NULL greift.
UPDATE "User" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;
ALTER TABLE "User" ALTER COLUMN "tenantId" SET DEFAULT 'tenant_texma';
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;
-- FK von SET NULL auf RESTRICT heben (SET NULL ist mit NOT NULL nicht mehr erfüllbar).
ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Company ──────────────────────────────────────────────────────────────────
UPDATE "Company" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;
ALTER TABLE "Company" ALTER COLUMN "tenantId" SET DEFAULT 'tenant_texma';
ALTER TABLE "Company" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Company" DROP CONSTRAINT "Company_tenantId_fkey";
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Company"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Supplier ─────────────────────────────────────────────────────────────────
UPDATE "Supplier" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;
ALTER TABLE "Supplier" ALTER COLUMN "tenantId" SET DEFAULT 'tenant_texma';
ALTER TABLE "Supplier" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Supplier" DROP CONSTRAINT "Supplier_tenantId_fkey";
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Supplier"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Article ──────────────────────────────────────────────────────────────────
UPDATE "Article" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;
ALTER TABLE "Article" ALTER COLUMN "tenantId" SET DEFAULT 'tenant_texma';
ALTER TABLE "Article" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Article" DROP CONSTRAINT "Article_tenantId_fkey";
ALTER TABLE "Article" ADD CONSTRAINT "Article_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Article" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Article"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Quote ────────────────────────────────────────────────────────────────────
UPDATE "Quote" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;
ALTER TABLE "Quote" ALTER COLUMN "tenantId" SET DEFAULT 'tenant_texma';
ALTER TABLE "Quote" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_tenantId_fkey";
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Quote"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Order ────────────────────────────────────────────────────────────────────
UPDATE "Order" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "tenantId" SET DEFAULT 'tenant_texma';
ALTER TABLE "Order" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Order" DROP CONSTRAINT "Order_tenantId_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Invoice ──────────────────────────────────────────────────────────────────
UPDATE "Invoice" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;
ALTER TABLE "Invoice" ALTER COLUMN "tenantId" SET DEFAULT 'tenant_texma';
ALTER TABLE "Invoice" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_tenantId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Invoice"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));
