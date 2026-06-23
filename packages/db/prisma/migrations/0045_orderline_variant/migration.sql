-- Auftragsübergreifender Warenbestellvorschlag: optionale Variantenverknüpfung der Auftragsposition.
ALTER TABLE "OrderLine" ADD COLUMN "variantId" TEXT;
