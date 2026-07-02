-- RLS Slice 1 — Fundament (ADR 0004): Tenant-Tabelle + additive/nullable tenantId
-- auf den Wurzel-Entitäten (User, Company, Supplier, Article, Quote, Order, Invoice)
-- inkl. Backfill auf den Default-Tenant. BEWUSST NICHT hier (kommt in Slice 2):
-- keine RLS-Policies, kein ENABLE ROW LEVEL SECURITY, kein NOT NULL — die Migration
-- ist rein additiv und hält den Bestand grün. Kinder-Tabellen folgen in Slice 3.

-- Mandanten-Tabelle
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- Default-Tenant für den Bestand (Backfill-Ziel; Seed/Dev-Login referenzieren ihn)
INSERT INTO "Tenant" ("id", "name") VALUES ('tenant_texma', 'TEXMA');

-- User
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
UPDATE "User" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;

-- Company
ALTER TABLE "Company" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Company_tenantId_idx" ON "Company"("tenantId");
UPDATE "Company" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;

-- Supplier
ALTER TABLE "Supplier" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Supplier_tenantId_idx" ON "Supplier"("tenantId");
UPDATE "Supplier" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;

-- Article
ALTER TABLE "Article" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Article" ADD CONSTRAINT "Article_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Article_tenantId_idx" ON "Article"("tenantId");
UPDATE "Article" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;

-- Quote
ALTER TABLE "Quote" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Quote_tenantId_idx" ON "Quote"("tenantId");
UPDATE "Quote" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;

-- Order
ALTER TABLE "Order" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Order_tenantId_idx" ON "Order"("tenantId");
UPDATE "Order" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;

-- Invoice
ALTER TABLE "Invoice" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");
UPDATE "Invoice" SET "tenantId" = 'tenant_texma' WHERE "tenantId" IS NULL;
