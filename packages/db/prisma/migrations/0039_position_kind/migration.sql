-- Textil- vs. Veredelungsposition (Kerngeschaeft Veredelung): Positionsart je Zeile.
CREATE TYPE "PositionKind" AS ENUM ('TEXTIL', 'VEREDELUNG', 'SONSTIGE');
ALTER TABLE "OrderLine" ADD COLUMN "kind" "PositionKind" NOT NULL DEFAULT 'TEXTIL';
ALTER TABLE "QuoteLine" ADD COLUMN "kind" "PositionKind" NOT NULL DEFAULT 'TEXTIL';
