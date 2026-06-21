-- B6: Kasse Bar/EC mit TSE (Kap. 37.4, KassenSichV) — CashSale append-only/WORM

-- CreateEnum
CREATE TYPE "PaymentArt" AS ENUM ('BAR', 'EC');

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSale" (
    "id" TEXT NOT NULL,
    "belegNr" TEXT NOT NULL,
    "registerId" TEXT,
    "orderId" TEXT,
    "betragCents" INTEGER NOT NULL,
    "art" "PaymentArt" NOT NULL,
    "kassiertAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kassierer" TEXT NOT NULL,
    "tseSignatur" TEXT NOT NULL,
    "tseSeriennummer" TEXT NOT NULL,
    "tseTxId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashSale_belegNr_key" ON "CashSale"("belegNr");
CREATE INDEX "CashSale_kassiertAm_idx" ON "CashSale"("kassiertAm");

-- AddForeignKey
ALTER TABLE "CashSale" ADD CONSTRAINT "CashSale_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashSale" ADD CONSTRAINT "CashSale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
