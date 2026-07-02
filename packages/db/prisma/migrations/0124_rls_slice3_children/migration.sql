-- RLS Slice 3 — Kinder-Tabellen (ADR 0004). GENERIERT aus dem Prisma-DMMF via
-- packages/db/scripts/rls-inventory.mjs (Klassifikation: packages/db/scripts/rls-inventory.md).
-- Je tenant-scoped Kind: tenantId als Pflichtfeld mit DEFAULT 'tenant_texma' (backfillt
-- bestehende Zeilen in EINEM Schritt und hält alle bestehenden INSERTs grün — Muster wie
-- Slice 2 für die Wurzeln; der Default fällt in Slice 4), FK auf Tenant, Index, dann
-- ENABLE ROW LEVEL SECURITY + Policy tenant_isolation.
--
-- Pflicht-Detail Performance (F12/InitPlan): current_setting MUSS als Skalar-Subquery
-- (SELECT …) gewrappt sein — Postgres evaluiert sie EINMAL pro Query (InitPlan) statt pro
-- Zeile (~18×, Benchmark ADR 0004). Der Generator erzeugt das Wrapping.
--
-- BEWUSST KEIN FORCE ROW LEVEL SECURITY (Slice-2-Schnitt, ADR 0004 Slice 4): der Owner-
-- Bypass (Migrations-/Owner-Rolle, F13) hält Dev/Migration/Seed grün; das Enforcement gilt
-- für die Laufzeit-Rolle texma_app (DATABASE_URL_RUNTIME). FORCE folgt in Slice 4.
--
-- Fail-closed: fehlt der Tenant-Kontext, ist current_setting('app.tenant_id', true) NULL →
-- der Vergleich ist NULL → texma_app sieht 0 Zeilen.
--
-- Global/exempt (bewusst OHNE tenantId): Tenant, PriceGroup
--   (Begründung s. rls-inventory.md). 105 tenant-scoped Kinder folgen.

-- ── Session ───────────────────────────────────────────────────────────────
ALTER TABLE "Session" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Session_tenantId_idx" ON "Session"("tenantId");
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Session"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── AccessLog ─────────────────────────────────────────────────────────────
ALTER TABLE "AccessLog" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AccessLog_tenantId_idx" ON "AccessLog"("tenantId");
ALTER TABLE "AccessLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AccessLog"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── CustomerSupplierPriceGroup ────────────────────────────────────────────
ALTER TABLE "CustomerSupplierPriceGroup" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "CustomerSupplierPriceGroup" ADD CONSTRAINT "CustomerSupplierPriceGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CustomerSupplierPriceGroup_tenantId_idx" ON "CustomerSupplierPriceGroup"("tenantId");
ALTER TABLE "CustomerSupplierPriceGroup" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomerSupplierPriceGroup"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Contact ───────────────────────────────────────────────────────────────
ALTER TABLE "Contact" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Contact_tenantId_idx" ON "Contact"("tenantId");
ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Contact"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── DeliveryAddress ───────────────────────────────────────────────────────
ALTER TABLE "DeliveryAddress" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "DeliveryAddress" ADD CONSTRAINT "DeliveryAddress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DeliveryAddress_tenantId_idx" ON "DeliveryAddress"("tenantId");
ALTER TABLE "DeliveryAddress" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeliveryAddress"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── LogoVersion ───────────────────────────────────────────────────────────
ALTER TABLE "LogoVersion" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "LogoVersion" ADD CONSTRAINT "LogoVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "LogoVersion_tenantId_idx" ON "LogoVersion"("tenantId");
ALTER TABLE "LogoVersion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LogoVersion"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── MarkupConfig ──────────────────────────────────────────────────────────
ALTER TABLE "MarkupConfig" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "MarkupConfig" ADD CONSTRAINT "MarkupConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MarkupConfig_tenantId_idx" ON "MarkupConfig"("tenantId");
ALTER TABLE "MarkupConfig" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MarkupConfig"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── MarkupRule ────────────────────────────────────────────────────────────
ALTER TABLE "MarkupRule" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "MarkupRule" ADD CONSTRAINT "MarkupRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MarkupRule_tenantId_idx" ON "MarkupRule"("tenantId");
ALTER TABLE "MarkupRule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MarkupRule"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── StickereiStaffel ──────────────────────────────────────────────────────
ALTER TABLE "StickereiStaffel" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "StickereiStaffel" ADD CONSTRAINT "StickereiStaffel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StickereiStaffel_tenantId_idx" ON "StickereiStaffel"("tenantId");
ALTER TABLE "StickereiStaffel" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StickereiStaffel"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── StickereiAusschreibung ────────────────────────────────────────────────
ALTER TABLE "StickereiAusschreibung" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "StickereiAusschreibung" ADD CONSTRAINT "StickereiAusschreibung_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StickereiAusschreibung_tenantId_idx" ON "StickereiAusschreibung"("tenantId");
ALTER TABLE "StickereiAusschreibung" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StickereiAusschreibung"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── StickereiAngebot ──────────────────────────────────────────────────────
ALTER TABLE "StickereiAngebot" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "StickereiAngebot" ADD CONSTRAINT "StickereiAngebot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StickereiAngebot_tenantId_idx" ON "StickereiAngebot"("tenantId");
ALTER TABLE "StickereiAngebot" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StickereiAngebot"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── StickereiAngebotStaffel ───────────────────────────────────────────────
ALTER TABLE "StickereiAngebotStaffel" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "StickereiAngebotStaffel" ADD CONSTRAINT "StickereiAngebotStaffel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StickereiAngebotStaffel_tenantId_idx" ON "StickereiAngebotStaffel"("tenantId");
ALTER TABLE "StickereiAngebotStaffel" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StickereiAngebotStaffel"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── MailAccount ───────────────────────────────────────────────────────────
ALTER TABLE "MailAccount" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "MailAccount" ADD CONSTRAINT "MailAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MailAccount_tenantId_idx" ON "MailAccount"("tenantId");
ALTER TABLE "MailAccount" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MailAccount"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── CallLog ───────────────────────────────────────────────────────────────
ALTER TABLE "CallLog" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CallLog_tenantId_idx" ON "CallLog"("tenantId");
ALTER TABLE "CallLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CallLog"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Collection ────────────────────────────────────────────────────────────
ALTER TABLE "Collection" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Collection_tenantId_idx" ON "Collection"("tenantId");
ALTER TABLE "Collection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Collection"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── MediaAsset ────────────────────────────────────────────────────────────
ALTER TABLE "MediaAsset" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MediaAsset_tenantId_idx" ON "MediaAsset"("tenantId");
ALTER TABLE "MediaAsset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MediaAsset"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── FinishingSpec ─────────────────────────────────────────────────────────
ALTER TABLE "FinishingSpec" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "FinishingSpec" ADD CONSTRAINT "FinishingSpec_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FinishingSpec_tenantId_idx" ON "FinishingSpec"("tenantId");
ALTER TABLE "FinishingSpec" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FinishingSpec"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Variant ───────────────────────────────────────────────────────────────
ALTER TABLE "Variant" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Variant_tenantId_idx" ON "Variant"("tenantId");
ALTER TABLE "Variant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Variant"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── VariantComponent ──────────────────────────────────────────────────────
ALTER TABLE "VariantComponent" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "VariantComponent" ADD CONSTRAINT "VariantComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "VariantComponent_tenantId_idx" ON "VariantComponent"("tenantId");
ALTER TABLE "VariantComponent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VariantComponent"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── VariantAttribute ──────────────────────────────────────────────────────
ALTER TABLE "VariantAttribute" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "VariantAttribute" ADD CONSTRAINT "VariantAttribute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "VariantAttribute_tenantId_idx" ON "VariantAttribute"("tenantId");
ALTER TABLE "VariantAttribute" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VariantAttribute"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── AxisValue ─────────────────────────────────────────────────────────────
ALTER TABLE "AxisValue" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "AxisValue" ADD CONSTRAINT "AxisValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AxisValue_tenantId_idx" ON "AxisValue"("tenantId");
ALTER TABLE "AxisValue" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AxisValue"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── SizeRun ───────────────────────────────────────────────────────────────
ALTER TABLE "SizeRun" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "SizeRun" ADD CONSTRAINT "SizeRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SizeRun_tenantId_idx" ON "SizeRun"("tenantId");
ALTER TABLE "SizeRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SizeRun"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── PriceGroupPrice ───────────────────────────────────────────────────────
ALTER TABLE "PriceGroupPrice" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "PriceGroupPrice" ADD CONSTRAINT "PriceGroupPrice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PriceGroupPrice_tenantId_idx" ON "PriceGroupPrice"("tenantId");
ALTER TABLE "PriceGroupPrice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceGroupPrice"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── PriceGroupPriceTier ───────────────────────────────────────────────────
ALTER TABLE "PriceGroupPriceTier" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "PriceGroupPriceTier" ADD CONSTRAINT "PriceGroupPriceTier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PriceGroupPriceTier_tenantId_idx" ON "PriceGroupPriceTier"("tenantId");
ALTER TABLE "PriceGroupPriceTier" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceGroupPriceTier"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── VariantEkTier ─────────────────────────────────────────────────────────
ALTER TABLE "VariantEkTier" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "VariantEkTier" ADD CONSTRAINT "VariantEkTier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "VariantEkTier_tenantId_idx" ON "VariantEkTier"("tenantId");
ALTER TABLE "VariantEkTier" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VariantEkTier"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── CustomerPriceTier ─────────────────────────────────────────────────────
ALTER TABLE "CustomerPriceTier" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "CustomerPriceTier" ADD CONSTRAINT "CustomerPriceTier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CustomerPriceTier_tenantId_idx" ON "CustomerPriceTier"("tenantId");
ALTER TABLE "CustomerPriceTier" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomerPriceTier"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── SupplierContact ───────────────────────────────────────────────────────
ALTER TABLE "SupplierContact" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SupplierContact_tenantId_idx" ON "SupplierContact"("tenantId");
ALTER TABLE "SupplierContact" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SupplierContact"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── SupplierItem ──────────────────────────────────────────────────────────
ALTER TABLE "SupplierItem" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SupplierItem_tenantId_idx" ON "SupplierItem"("tenantId");
ALTER TABLE "SupplierItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SupplierItem"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── ShopConnector ─────────────────────────────────────────────────────────
ALTER TABLE "ShopConnector" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "ShopConnector" ADD CONSTRAINT "ShopConnector_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ShopConnector_tenantId_idx" ON "ShopConnector"("tenantId");
ALTER TABLE "ShopConnector" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ShopConnector"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── CollectiveOrder ───────────────────────────────────────────────────────
ALTER TABLE "CollectiveOrder" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "CollectiveOrder" ADD CONSTRAINT "CollectiveOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CollectiveOrder_tenantId_idx" ON "CollectiveOrder"("tenantId");
ALTER TABLE "CollectiveOrder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CollectiveOrder"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── PortalUser ────────────────────────────────────────────────────────────
ALTER TABLE "PortalUser" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "PortalUser" ADD CONSTRAINT "PortalUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PortalUser_tenantId_idx" ON "PortalUser"("tenantId");
ALTER TABLE "PortalUser" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PortalUser"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── PortalSession ─────────────────────────────────────────────────────────
ALTER TABLE "PortalSession" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "PortalSession" ADD CONSTRAINT "PortalSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PortalSession_tenantId_idx" ON "PortalSession"("tenantId");
ALTER TABLE "PortalSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PortalSession"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Lead ──────────────────────────────────────────────────────────────────
ALTER TABLE "Lead" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Lead_tenantId_idx" ON "Lead"("tenantId");
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Lead"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Inquiry ───────────────────────────────────────────────────────────────
ALTER TABLE "Inquiry" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Inquiry_tenantId_idx" ON "Inquiry"("tenantId");
ALTER TABLE "Inquiry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Inquiry"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── QuoteLine ─────────────────────────────────────────────────────────────
ALTER TABLE "QuoteLine" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "QuoteLine_tenantId_idx" ON "QuoteLine"("tenantId");
ALTER TABLE "QuoteLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QuoteLine"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── OrderLine ─────────────────────────────────────────────────────────────
ALTER TABLE "OrderLine" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "OrderLine_tenantId_idx" ON "OrderLine"("tenantId");
ALTER TABLE "OrderLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrderLine"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── BomTemplate ───────────────────────────────────────────────────────────
ALTER TABLE "BomTemplate" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "BomTemplate" ADD CONSTRAINT "BomTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "BomTemplate_tenantId_idx" ON "BomTemplate"("tenantId");
ALTER TABLE "BomTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BomTemplate"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── BomTemplateItem ───────────────────────────────────────────────────────
ALTER TABLE "BomTemplateItem" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "BomTemplateItem" ADD CONSTRAINT "BomTemplateItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "BomTemplateItem_tenantId_idx" ON "BomTemplateItem"("tenantId");
ALTER TABLE "BomTemplateItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BomTemplateItem"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── ProductionOrder ───────────────────────────────────────────────────────
ALTER TABLE "ProductionOrder" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ProductionOrder_tenantId_idx" ON "ProductionOrder"("tenantId");
ALTER TABLE "ProductionOrder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductionOrder"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── BomItem ───────────────────────────────────────────────────────────────
ALTER TABLE "BomItem" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "BomItem_tenantId_idx" ON "BomItem"("tenantId");
ALTER TABLE "BomItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BomItem"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── SubProductionOrder ────────────────────────────────────────────────────
ALTER TABLE "SubProductionOrder" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "SubProductionOrder" ADD CONSTRAINT "SubProductionOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SubProductionOrder_tenantId_idx" ON "SubProductionOrder"("tenantId");
ALTER TABLE "SubProductionOrder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SubProductionOrder"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── TimeEntry ─────────────────────────────────────────────────────────────
ALTER TABLE "TimeEntry" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TimeEntry_tenantId_idx" ON "TimeEntry"("tenantId");
ALTER TABLE "TimeEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TimeEntry"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── SampleLoan ────────────────────────────────────────────────────────────
ALTER TABLE "SampleLoan" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "SampleLoan" ADD CONSTRAINT "SampleLoan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SampleLoan_tenantId_idx" ON "SampleLoan"("tenantId");
ALTER TABLE "SampleLoan" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SampleLoan"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── SampleLoanLine ────────────────────────────────────────────────────────
ALTER TABLE "SampleLoanLine" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "SampleLoanLine" ADD CONSTRAINT "SampleLoanLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SampleLoanLine_tenantId_idx" ON "SampleLoanLine"("tenantId");
ALTER TABLE "SampleLoanLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SampleLoanLine"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── CostCenter ────────────────────────────────────────────────────────────
ALTER TABLE "CostCenter" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CostCenter_tenantId_idx" ON "CostCenter"("tenantId");
ALTER TABLE "CostCenter" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CostCenter"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── DatevExportEntry ──────────────────────────────────────────────────────
ALTER TABLE "DatevExportEntry" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "DatevExportEntry" ADD CONSTRAINT "DatevExportEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DatevExportEntry_tenantId_idx" ON "DatevExportEntry"("tenantId");
ALTER TABLE "DatevExportEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DatevExportEntry"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── OpenItem ──────────────────────────────────────────────────────────────
ALTER TABLE "OpenItem" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "OpenItem" ADD CONSTRAINT "OpenItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "OpenItem_tenantId_idx" ON "OpenItem"("tenantId");
ALTER TABLE "OpenItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OpenItem"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── CashRegister ──────────────────────────────────────────────────────────
ALTER TABLE "CashRegister" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CashRegister_tenantId_idx" ON "CashRegister"("tenantId");
ALTER TABLE "CashRegister" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashRegister"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── CashSale ──────────────────────────────────────────────────────────────
ALTER TABLE "CashSale" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "CashSale" ADD CONSTRAINT "CashSale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CashSale_tenantId_idx" ON "CashSale"("tenantId");
ALTER TABLE "CashSale" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashSale"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── DunningNotice ─────────────────────────────────────────────────────────
ALTER TABLE "DunningNotice" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "DunningNotice" ADD CONSTRAINT "DunningNotice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DunningNotice_tenantId_idx" ON "DunningNotice"("tenantId");
ALTER TABLE "DunningNotice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DunningNotice"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Payment ───────────────────────────────────────────────────────────────
ALTER TABLE "Payment" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payment"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── PaymentAllocation ─────────────────────────────────────────────────────
ALTER TABLE "PaymentAllocation" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PaymentAllocation_tenantId_idx" ON "PaymentAllocation"("tenantId");
ALTER TABLE "PaymentAllocation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentAllocation"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── BankConnection ────────────────────────────────────────────────────────
ALTER TABLE "BankConnection" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "BankConnection" ADD CONSTRAINT "BankConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "BankConnection_tenantId_idx" ON "BankConnection"("tenantId");
ALTER TABLE "BankConnection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BankConnection"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── PaymentOrder ──────────────────────────────────────────────────────────
ALTER TABLE "PaymentOrder" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PaymentOrder_tenantId_idx" ON "PaymentOrder"("tenantId");
ALTER TABLE "PaymentOrder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentOrder"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── PaymentTransfer ───────────────────────────────────────────────────────
ALTER TABLE "PaymentTransfer" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "PaymentTransfer" ADD CONSTRAINT "PaymentTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PaymentTransfer_tenantId_idx" ON "PaymentTransfer"("tenantId");
ALTER TABLE "PaymentTransfer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentTransfer"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── AuditLog ──────────────────────────────────────────────────────────────
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── NumberSequence ────────────────────────────────────────────────────────
ALTER TABLE "NumberSequence" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "NumberSequence" ADD CONSTRAINT "NumberSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "NumberSequence_tenantId_idx" ON "NumberSequence"("tenantId");
ALTER TABLE "NumberSequence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NumberSequence"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── PurchaseOrder ─────────────────────────────────────────────────────────
ALTER TABLE "PurchaseOrder" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PurchaseOrder_tenantId_idx" ON "PurchaseOrder"("tenantId");
ALTER TABLE "PurchaseOrder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PurchaseOrder"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── PurchaseOrderLine ─────────────────────────────────────────────────────
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PurchaseOrderLine_tenantId_idx" ON "PurchaseOrderLine"("tenantId");
ALTER TABLE "PurchaseOrderLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PurchaseOrderLine"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── PurchaseOrderLineSource ───────────────────────────────────────────────
ALTER TABLE "PurchaseOrderLineSource" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "PurchaseOrderLineSource" ADD CONSTRAINT "PurchaseOrderLineSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PurchaseOrderLineSource_tenantId_idx" ON "PurchaseOrderLineSource"("tenantId");
ALTER TABLE "PurchaseOrderLineSource" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PurchaseOrderLineSource"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── GoodsReceipt ──────────────────────────────────────────────────────────
ALTER TABLE "GoodsReceipt" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "GoodsReceipt_tenantId_idx" ON "GoodsReceipt"("tenantId");
ALTER TABLE "GoodsReceipt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GoodsReceipt"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── GoodsReceiptLine ──────────────────────────────────────────────────────
ALTER TABLE "GoodsReceiptLine" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "GoodsReceiptLine_tenantId_idx" ON "GoodsReceiptLine"("tenantId");
ALTER TABLE "GoodsReceiptLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GoodsReceiptLine"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Warehouse ─────────────────────────────────────────────────────────────
ALTER TABLE "Warehouse" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Warehouse_tenantId_idx" ON "Warehouse"("tenantId");
ALTER TABLE "Warehouse" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Warehouse"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── StockLevel ────────────────────────────────────────────────────────────
ALTER TABLE "StockLevel" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StockLevel_tenantId_idx" ON "StockLevel"("tenantId");
ALTER TABLE "StockLevel" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StockLevel"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── StockMove ─────────────────────────────────────────────────────────────
ALTER TABLE "StockMove" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StockMove_tenantId_idx" ON "StockMove"("tenantId");
ALTER TABLE "StockMove" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StockMove"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── StockReservation ──────────────────────────────────────────────────────
ALTER TABLE "StockReservation" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StockReservation_tenantId_idx" ON "StockReservation"("tenantId");
ALTER TABLE "StockReservation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StockReservation"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── StockThreshold ────────────────────────────────────────────────────────
ALTER TABLE "StockThreshold" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "StockThreshold" ADD CONSTRAINT "StockThreshold_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StockThreshold_tenantId_idx" ON "StockThreshold"("tenantId");
ALTER TABLE "StockThreshold" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StockThreshold"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── IncomingInvoice ───────────────────────────────────────────────────────
ALTER TABLE "IncomingInvoice" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "IncomingInvoice_tenantId_idx" ON "IncomingInvoice"("tenantId");
ALTER TABLE "IncomingInvoice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "IncomingInvoice"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── IncomingInvoiceLine ───────────────────────────────────────────────────
ALTER TABLE "IncomingInvoiceLine" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "IncomingInvoiceLine" ADD CONSTRAINT "IncomingInvoiceLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "IncomingInvoiceLine_tenantId_idx" ON "IncomingInvoiceLine"("tenantId");
ALTER TABLE "IncomingInvoiceLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "IncomingInvoiceLine"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── DeliveryNote ──────────────────────────────────────────────────────────
ALTER TABLE "DeliveryNote" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DeliveryNote_tenantId_idx" ON "DeliveryNote"("tenantId");
ALTER TABLE "DeliveryNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeliveryNote"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── DeliveryNoteLine ──────────────────────────────────────────────────────
ALTER TABLE "DeliveryNoteLine" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DeliveryNoteLine_tenantId_idx" ON "DeliveryNoteLine"("tenantId");
ALTER TABLE "DeliveryNoteLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeliveryNoteLine"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── CreditNote ────────────────────────────────────────────────────────────
ALTER TABLE "CreditNote" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CreditNote_tenantId_idx" ON "CreditNote"("tenantId");
ALTER TABLE "CreditNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CreditNote"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── ApiToken ──────────────────────────────────────────────────────────────
ALTER TABLE "ApiToken" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ApiToken_tenantId_idx" ON "ApiToken"("tenantId");
ALTER TABLE "ApiToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApiToken"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Abschlagsrechnung ─────────────────────────────────────────────────────
ALTER TABLE "Abschlagsrechnung" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Abschlagsrechnung" ADD CONSTRAINT "Abschlagsrechnung_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Abschlagsrechnung_tenantId_idx" ON "Abschlagsrechnung"("tenantId");
ALTER TABLE "Abschlagsrechnung" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Abschlagsrechnung"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Gutschein ─────────────────────────────────────────────────────────────
ALTER TABLE "Gutschein" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Gutschein" ADD CONSTRAINT "Gutschein_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Gutschein_tenantId_idx" ON "Gutschein"("tenantId");
ALTER TABLE "Gutschein" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Gutschein"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Complaint ─────────────────────────────────────────────────────────────
ALTER TABLE "Complaint" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Complaint_tenantId_idx" ON "Complaint"("tenantId");
ALTER TABLE "Complaint" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Complaint"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── DueItem ───────────────────────────────────────────────────────────────
ALTER TABLE "DueItem" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "DueItem" ADD CONSTRAINT "DueItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DueItem_tenantId_idx" ON "DueItem"("tenantId");
ALTER TABLE "DueItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DueItem"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── FinishingTargetTime ───────────────────────────────────────────────────
ALTER TABLE "FinishingTargetTime" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "FinishingTargetTime" ADD CONSTRAINT "FinishingTargetTime_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FinishingTargetTime_tenantId_idx" ON "FinishingTargetTime"("tenantId");
ALTER TABLE "FinishingTargetTime" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FinishingTargetTime"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── ApprovalThreshold ─────────────────────────────────────────────────────
ALTER TABLE "ApprovalThreshold" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "ApprovalThreshold" ADD CONSTRAINT "ApprovalThreshold_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ApprovalThreshold_tenantId_idx" ON "ApprovalThreshold"("tenantId");
ALTER TABLE "ApprovalThreshold" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApprovalThreshold"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── OutboxEvent ───────────────────────────────────────────────────────────
ALTER TABLE "OutboxEvent" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "OutboxEvent_tenantId_idx" ON "OutboxEvent"("tenantId");
ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OutboxEvent"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── IntegrationLog ────────────────────────────────────────────────────────
ALTER TABLE "IntegrationLog" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "IntegrationLog" ADD CONSTRAINT "IntegrationLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "IntegrationLog_tenantId_idx" ON "IntegrationLog"("tenantId");
ALTER TABLE "IntegrationLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "IntegrationLog"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── RecordComment ─────────────────────────────────────────────────────────
ALTER TABLE "RecordComment" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "RecordComment" ADD CONSTRAINT "RecordComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RecordComment_tenantId_idx" ON "RecordComment"("tenantId");
ALTER TABLE "RecordComment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RecordComment"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── RecordActivity ────────────────────────────────────────────────────────
ALTER TABLE "RecordActivity" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "RecordActivity" ADD CONSTRAINT "RecordActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RecordActivity_tenantId_idx" ON "RecordActivity"("tenantId");
ALTER TABLE "RecordActivity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RecordActivity"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── RecordAttachment ──────────────────────────────────────────────────────
ALTER TABLE "RecordAttachment" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "RecordAttachment" ADD CONSTRAINT "RecordAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RecordAttachment_tenantId_idx" ON "RecordAttachment"("tenantId");
ALTER TABLE "RecordAttachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RecordAttachment"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Notification ──────────────────────────────────────────────────────────
ALTER TABLE "Notification" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Notification"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── EmailTemplate ─────────────────────────────────────────────────────────
ALTER TABLE "EmailTemplate" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "EmailTemplate_tenantId_idx" ON "EmailTemplate"("tenantId");
ALTER TABLE "EmailTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmailTemplate"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── DashboardChart ────────────────────────────────────────────────────────
ALTER TABLE "DashboardChart" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "DashboardChart" ADD CONSTRAINT "DashboardChart_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DashboardChart_tenantId_idx" ON "DashboardChart"("tenantId");
ALTER TABLE "DashboardChart" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DashboardChart"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── NumberCard ────────────────────────────────────────────────────────────
ALTER TABLE "NumberCard" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "NumberCard" ADD CONSTRAINT "NumberCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "NumberCard_tenantId_idx" ON "NumberCard"("tenantId");
ALTER TABLE "NumberCard" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NumberCard"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Dashboard ─────────────────────────────────────────────────────────────
ALTER TABLE "Dashboard" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Dashboard_tenantId_idx" ON "Dashboard"("tenantId");
ALTER TABLE "Dashboard" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Dashboard"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── DashboardItem ─────────────────────────────────────────────────────────
ALTER TABLE "DashboardItem" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "DashboardItem" ADD CONSTRAINT "DashboardItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DashboardItem_tenantId_idx" ON "DashboardItem"("tenantId");
ALTER TABLE "DashboardItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DashboardItem"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── NewsletterCampaign ────────────────────────────────────────────────────
ALTER TABLE "NewsletterCampaign" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "NewsletterCampaign" ADD CONSTRAINT "NewsletterCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "NewsletterCampaign_tenantId_idx" ON "NewsletterCampaign"("tenantId");
ALTER TABLE "NewsletterCampaign" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NewsletterCampaign"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── CrmLead ───────────────────────────────────────────────────────────────
ALTER TABLE "CrmLead" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CrmLead_tenantId_idx" ON "CrmLead"("tenantId");
ALTER TABLE "CrmLead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CrmLead"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Opportunity ───────────────────────────────────────────────────────────
ALTER TABLE "Opportunity" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Opportunity_tenantId_idx" ON "Opportunity"("tenantId");
ALTER TABLE "Opportunity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Opportunity"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── CalendarEvent ─────────────────────────────────────────────────────────
ALTER TABLE "CalendarEvent" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CalendarEvent_tenantId_idx" ON "CalendarEvent"("tenantId");
ALTER TABLE "CalendarEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CalendarEvent"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── InternalMessage ───────────────────────────────────────────────────────
ALTER TABLE "InternalMessage" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "InternalMessage_tenantId_idx" ON "InternalMessage"("tenantId");
ALTER TABLE "InternalMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InternalMessage"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── AppSetting ────────────────────────────────────────────────────────────
ALTER TABLE "AppSetting" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AppSetting_tenantId_idx" ON "AppSetting"("tenantId");
ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AppSetting"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Employee ──────────────────────────────────────────────────────────────
ALTER TABLE "Employee" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Employee_tenantId_idx" ON "Employee"("tenantId");
ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Employee"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── VacationRequest ───────────────────────────────────────────────────────
ALTER TABLE "VacationRequest" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "VacationRequest_tenantId_idx" ON "VacationRequest"("tenantId");
ALTER TABLE "VacationRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VacationRequest"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── IntegrationSetting ────────────────────────────────────────────────────
ALTER TABLE "IntegrationSetting" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "IntegrationSetting" ADD CONSTRAINT "IntegrationSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "IntegrationSetting_tenantId_idx" ON "IntegrationSetting"("tenantId");
ALTER TABLE "IntegrationSetting" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "IntegrationSetting"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── PasswordResetToken ────────────────────────────────────────────────────
ALTER TABLE "PasswordResetToken" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PasswordResetToken_tenantId_idx" ON "PasswordResetToken"("tenantId");
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PasswordResetToken"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── Task ──────────────────────────────────────────────────────────────────
ALTER TABLE "Task" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Task_tenantId_idx" ON "Task"("tenantId");
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Task"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── UserPreference ────────────────────────────────────────────────────────
ALTER TABLE "UserPreference" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "UserPreference_tenantId_idx" ON "UserPreference"("tenantId");
ALTER TABLE "UserPreference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UserPreference"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── AutomationRule ────────────────────────────────────────────────────────
ALTER TABLE "AutomationRule" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AutomationRule_tenantId_idx" ON "AutomationRule"("tenantId");
ALTER TABLE "AutomationRule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AutomationRule"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── ContactLink ───────────────────────────────────────────────────────────
ALTER TABLE "ContactLink" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "ContactLink" ADD CONSTRAINT "ContactLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ContactLink_tenantId_idx" ON "ContactLink"("tenantId");
ALTER TABLE "ContactLink" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ContactLink"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));

-- ── ArchivedDocument ──────────────────────────────────────────────────────
ALTER TABLE "ArchivedDocument" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_texma';
ALTER TABLE "ArchivedDocument" ADD CONSTRAINT "ArchivedDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ArchivedDocument_tenantId_idx" ON "ArchivedDocument"("tenantId");
ALTER TABLE "ArchivedDocument" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ArchivedDocument"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));
