-- Mehrfach-Teillieferung: Lieferzeilen (gelieferte Menge je Auftragsposition).

CREATE TABLE "DeliveryNoteLine" (
    "id" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    CONSTRAINT "DeliveryNoteLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryNoteLine_deliveryNoteId_idx" ON "DeliveryNoteLine"("deliveryNoteId");
CREATE INDEX "DeliveryNoteLine_orderLineId_idx" ON "DeliveryNoteLine"("orderLineId");

ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
