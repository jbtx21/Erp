-- Gutschein/Wertgutschein (Xentral „Gutscheine"): Code + Restguthaben + Gültigkeit.
CREATE TABLE "Gutschein" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialCents" INTEGER NOT NULL,
    "remainingCents" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3),
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Gutschein_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Gutschein_code_key" ON "Gutschein"("code");
