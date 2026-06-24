-- Stickerei-Ausschreibung (RfQ): Logo an mehrere Partner, Angebote (EK-Staffeln), Auswahl.
CREATE TABLE "StickereiAusschreibung" (
  "id" TEXT NOT NULL,
  "logoVersionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OFFEN',
  "gewinnerAngebotId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "StickereiAusschreibung_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StickereiAusschreibung_logoVersionId_idx" ON "StickereiAusschreibung"("logoVersionId");
ALTER TABLE "StickereiAusschreibung" ADD CONSTRAINT "StickereiAusschreibung_logoVersionId_fkey" FOREIGN KEY ("logoVersionId") REFERENCES "LogoVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StickereiAngebot" (
  "id" TEXT NOT NULL,
  "ausschreibungId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "notiz" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StickereiAngebot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StickereiAngebot_ausschreibungId_idx" ON "StickereiAngebot"("ausschreibungId");
ALTER TABLE "StickereiAngebot" ADD CONSTRAINT "StickereiAngebot_ausschreibungId_fkey" FOREIGN KEY ("ausschreibungId") REFERENCES "StickereiAusschreibung"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StickereiAngebot" ADD CONSTRAINT "StickereiAngebot_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StickereiAngebotStaffel" (
  "id" TEXT NOT NULL,
  "angebotId" TEXT NOT NULL,
  "minMenge" INTEGER NOT NULL,
  "ekCents" INTEGER NOT NULL,
  CONSTRAINT "StickereiAngebotStaffel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StickereiAngebotStaffel_angebotId_minMenge_key" ON "StickereiAngebotStaffel"("angebotId", "minMenge");
ALTER TABLE "StickereiAngebotStaffel" ADD CONSTRAINT "StickereiAngebotStaffel_angebotId_fkey" FOREIGN KEY ("angebotId") REFERENCES "StickereiAngebot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
