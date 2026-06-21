-- B4: Basispreis-Mengenstaffeln (Kap. 4.4 / T-15)

-- CreateTable: Preisgruppen-Staffel (global je Preisgruppe)
CREATE TABLE "PriceGroupPriceTier" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "priceGroupId" TEXT NOT NULL,
    "minMenge" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,

    CONSTRAINT "PriceGroupPriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable: kundenindividuelle Staffel (höchste Präzedenz)
CREATE TABLE "CustomerPriceTier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "minMenge" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,

    CONSTRAINT "CustomerPriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceGroupPriceTier_variantId_priceGroupId_minMenge_key" ON "PriceGroupPriceTier"("variantId", "priceGroupId", "minMenge");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPriceTier_companyId_variantId_minMenge_key" ON "CustomerPriceTier"("companyId", "variantId", "minMenge");

-- AddForeignKey
ALTER TABLE "PriceGroupPriceTier" ADD CONSTRAINT "PriceGroupPriceTier_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceGroupPriceTier" ADD CONSTRAINT "PriceGroupPriceTier_priceGroupId_fkey" FOREIGN KEY ("priceGroupId") REFERENCES "PriceGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceTier" ADD CONSTRAINT "CustomerPriceTier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceTier" ADD CONSTRAINT "CustomerPriceTier_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
