-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'BUERO', 'PRODUKTION', 'BUCHHALTUNG');

-- CreateEnum
CREATE TYPE "PriceGroupKind" AS ENUM ('STANDARD', 'TOP', 'PREMIUM', 'WIEDERVERKAEUFER', 'AGENTUR');

-- CreateEnum
CREATE TYPE "ShopKind" AS ENUM ('WOOCOMMERCE', 'ANFRAGESHOP', 'SAMMELBESTELLUNG');

-- CreateEnum
CREATE TYPE "DeliveryAddressPolicy" AS ENUM ('FEST', 'FREIE_EINGABE', 'AUSWAHL');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('ENTWURF', 'VERSENDET', 'NACHFASSEN', 'ANGENOMMEN', 'ABGELEHNT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('ANGELEGT', 'IN_BEARBEITUNG', 'IN_PRODUKTION', 'VERSANDBEREIT', 'VERSENDET', 'STORNIERT');

-- CreateEnum
CREATE TYPE "AmpelStatus" AS ENUM ('GRUEN', 'GELB', 'ROT');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('ENTWURF', 'BESTELLT', 'TEILWEISE_ERHALTEN', 'ERHALTEN');

-- CreateEnum
CREATE TYPE "IncomingInvoiceStatus" AS ENUM ('ERFASST', 'GEPRUEFT', 'GESPERRT', 'BEZAHLT');

-- CreateEnum
CREATE TYPE "ComplaintCause" AS ENUM ('LIEFERANT', 'INTERN', 'EXTERN_VEREDLER');

-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('NACHPRODUKTION', 'EXPRESS_NACHPRODUKTION', 'GUTSCHRIFT', 'KEINE');

-- CreateEnum
CREATE TYPE "FinishingKind" AS ENUM ('TRANSFER', 'SIEBDRUCK_EINRICHTUNG', 'SIEBDRUCK_DRUCK', 'STICK');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceGroup" (
    "id" TEXT NOT NULL,
    "kind" "PriceGroupKind" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "PriceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branche" TEXT,
    "zahlungszielTage" INTEGER NOT NULL DEFAULT 14,
    "mahnsperre" BOOLEAN NOT NULL DEFAULT false,
    "priceGroupId" TEXT NOT NULL,
    "stickereiPartnerId" TEXT,
    "hatStickdatei" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAddress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'DE',

    CONSTRAINT "DeliveryAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogoVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileRef" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "replacedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogoVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isVeredelung" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantAttribute" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "VariantAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceGroupPrice" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "priceGroupId" TEXT NOT NULL,
    "netCents" INTEGER NOT NULL,

    CONSTRAINT "PriceGroupPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectorKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierItem" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "ekCents" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "minStock" INTEGER,

    CONSTRAINT "SupplierItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopConnector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ShopKind" NOT NULL DEFAULT 'WOOCOMMERCE',
    "baseUrl" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bomTemplateId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deliveryAddressPolicy" "DeliveryAddressPolicy" NOT NULL DEFAULT 'FEST',
    "syncCursor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'ENTWURF',
    "wiedervorlageAm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitNetCents" INTEGER NOT NULL,
    "dbCents" INTEGER,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deliveryAddressId" TEXT,
    "shopConnectorId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'ANGELEGT',
    "quoteId" TEXT,
    "fileLink" TEXT,
    "freigegeben" BOOLEAN NOT NULL DEFAULT false,
    "employeeNote" TEXT,
    "externalNumber" TEXT,
    "trackingNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitNetCents" INTEGER NOT NULL,
    "rawPayload" JSONB,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BomTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultQty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BomTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ampel" "AmpelStatus" NOT NULL DEFAULT 'GRUEN',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomItem" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "variantId" TEXT,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "BomItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubProductionOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "beistellungVersandtAm" TIMESTAMP(3),
    "ruecklaufErhaltenAm" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OFFEN',

    CONSTRAINT "SubProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "netCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eInvoiceXml" TEXT,
    "finalized" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "openCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "dunningLevel" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OpenItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "matched" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "openItemId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'ENTWURF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "ekCents" INTEGER NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptLine" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "receivedQty" INTEGER NOT NULL,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "netCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "status" "IncomingInvoiceStatus" NOT NULL DEFAULT 'ERFASST',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "cause" "ComplaintCause" NOT NULL,
    "followUp" "FollowUpType" NOT NULL DEFAULT 'KEINE',
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "costBearer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DueItem" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinishingTargetTime" (
    "id" TEXT NOT NULL,
    "kind" "FinishingKind" NOT NULL,
    "targetMinutes" DOUBLE PRECISION NOT NULL,
    "basis" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinishingTargetTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalThreshold" (
    "id" TEXT NOT NULL,
    "maxDiscountPct" DOUBLE PRECISION,
    "maxOrderValueCents" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AccessLog_entity_entityId_idx" ON "AccessLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceGroup_kind_key" ON "PriceGroup"("kind");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE INDEX "DeliveryAddress_companyId_idx" ON "DeliveryAddress"("companyId");

-- CreateIndex
CREATE INDEX "LogoVersion_companyId_active_idx" ON "LogoVersion"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LogoVersion_companyId_version_key" ON "LogoVersion"("companyId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Article_sku_key" ON "Article"("sku");

-- CreateIndex
CREATE INDEX "Article_name_idx" ON "Article"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_sku_key" ON "Variant"("sku");

-- CreateIndex
CREATE INDEX "Variant_articleId_idx" ON "Variant"("articleId");

-- CreateIndex
CREATE INDEX "VariantAttribute_name_value_idx" ON "VariantAttribute"("name", "value");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttribute_variantId_name_key" ON "VariantAttribute"("variantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PriceGroupPrice_variantId_priceGroupId_key" ON "PriceGroupPrice"("variantId", "priceGroupId");

-- CreateIndex
CREATE INDEX "SupplierItem_variantId_priority_idx" ON "SupplierItem"("variantId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierItem_supplierId_variantId_key" ON "SupplierItem"("supplierId", "variantId");

-- CreateIndex
CREATE INDEX "ShopConnector_companyId_idx" ON "ShopConnector"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_quoteId_key" ON "Order"("quoteId");

-- CreateIndex
CREATE INDEX "Order_companyId_idx" ON "Order"("companyId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shopConnectorId_externalNumber_key" ON "Order"("shopConnectorId", "externalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_number_key" ON "ProductionOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_orderId_key" ON "ProductionOrder"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SubProductionOrder_number_key" ON "SubProductionOrder"("number");

-- CreateIndex
CREATE INDEX "SubProductionOrder_productionId_idx" ON "SubProductionOrder"("productionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_idx" ON "Invoice"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenItem_invoiceId_key" ON "OpenItem"("invoiceId");

-- CreateIndex
CREATE INDEX "OpenItem_dueDate_idx" ON "OpenItem"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_openItemId_key" ON "PaymentAllocation"("paymentId", "openItemId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_purchaseOrderId_idx" ON "GoodsReceipt"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_goodsReceiptId_idx" ON "GoodsReceiptLine"("goodsReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_variantId_key" ON "StockLevel"("variantId");

-- CreateIndex
CREATE INDEX "IncomingInvoice_status_idx" ON "IncomingInvoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingInvoice_supplierId_number_key" ON "IncomingInvoice"("supplierId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_number_key" ON "DeliveryNote"("number");

-- CreateIndex
CREATE INDEX "DeliveryNote_orderId_idx" ON "DeliveryNote"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_number_key" ON "CreditNote"("number");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "Complaint_orderId_idx" ON "Complaint"("orderId");

-- CreateIndex
CREATE INDEX "DueItem_dueDate_done_idx" ON "DueItem"("dueDate", "done");

-- CreateIndex
CREATE INDEX "DueItem_entity_entityId_idx" ON "DueItem"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "FinishingTargetTime_kind_key" ON "FinishingTargetTime"("kind");

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_priceGroupId_fkey" FOREIGN KEY ("priceGroupId") REFERENCES "PriceGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_stickereiPartnerId_fkey" FOREIGN KEY ("stickereiPartnerId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAddress" ADD CONSTRAINT "DeliveryAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogoVersion" ADD CONSTRAINT "LogoVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttribute" ADD CONSTRAINT "VariantAttribute_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceGroupPrice" ADD CONSTRAINT "PriceGroupPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceGroupPrice" ADD CONSTRAINT "PriceGroupPrice_priceGroupId_fkey" FOREIGN KEY ("priceGroupId") REFERENCES "PriceGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopConnector" ADD CONSTRAINT "ShopConnector_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopConnector" ADD CONSTRAINT "ShopConnector_bomTemplateId_fkey" FOREIGN KEY ("bomTemplateId") REFERENCES "BomTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryAddressId_fkey" FOREIGN KEY ("deliveryAddressId") REFERENCES "DeliveryAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopConnectorId_fkey" FOREIGN KEY ("shopConnectorId") REFERENCES "ShopConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomTemplateItem" ADD CONSTRAINT "BomTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BomTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubProductionOrder" ADD CONSTRAINT "SubProductionOrder_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubProductionOrder" ADD CONSTRAINT "SubProductionOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenItem" ADD CONSTRAINT "OpenItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_openItemId_fkey" FOREIGN KEY ("openItemId") REFERENCES "OpenItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

