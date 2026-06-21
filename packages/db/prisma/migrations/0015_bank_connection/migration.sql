-- Bank-Anbindung (Kap. 9): EBICS/PSD2-Verbindungen + SEPA-Zahlungsaufträge (PIS)

-- CreateEnum
CREATE TYPE "BankConnectionKind" AS ENUM ('EBICS', 'PSD2');
CREATE TYPE "PaymentOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'EXECUTED', 'REJECTED');

-- AlterTable: Gläubiger-Bankdaten am Lieferanten
ALTER TABLE "Supplier" ADD COLUMN "iban" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "bic" TEXT;

-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "BankConnectionKind" NOT NULL,
    "iban" TEXT NOT NULL,
    "bic" TEXT,
    "debtorName" TEXT NOT NULL,
    "consentValidUntil" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCents" INTEGER NOT NULL,
    "requestedExecutionDate" TEXT NOT NULL,
    "providerRef" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentTransfer" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "creditorIban" TEXT NOT NULL,
    "creditorBic" TEXT,
    "amountCents" INTEGER NOT NULL,
    "remittance" TEXT NOT NULL,

    CONSTRAINT "PaymentTransfer_pkey" PRIMARY KEY ("id")
);

-- Indexes / Constraints
CREATE UNIQUE INDEX "PaymentOrder_messageId_key" ON "PaymentOrder"("messageId");
CREATE INDEX "PaymentOrder_connectionId_status_idx" ON "PaymentOrder"("connectionId", "status");

-- Foreign Keys
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTransfer" ADD CONSTRAINT "PaymentTransfer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PaymentOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
