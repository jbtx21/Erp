// Anwendungsfall: Stickerei-Partnerwahl + Mengenstaffeln je Logo (Kap. 5.4 / 4.4).
// Bindet die reine Logik (@texma/shared) an die Stammdaten: hinterlegter Partner +
// vorhandene Stickdatei → Direktauftrag, sonst Ausschreibung. Die Stickereien geben
// uns nur ihren VK (= unseren Stick-EK) je Stück gestaffelt nach Menge; je Logo werden
// die frei wählbaren Staffeln (Stick-EK) persistiert, unser VK = EK × 1,88 berechnet.
// Repository als Interface (Prisma im Prod, In-Memory in Tests/Durchstich).

import {
  computeStickereiStaffelVks,
  planStickerei,
  stickereiPriceForMenge,
  type StickereiContext,
  type StickereiPlan,
  type StickereiStaffel,
  type StickereiStaffelVk,
} from "@texma/shared";

export interface StickereiRepository {
  contextForCompany(companyId: string): Promise<StickereiContext | null>;
  /** Persistierte Staffeln (Stick-EK je Stück) eines Logos, beliebige Reihenfolge. */
  listStaffeln(logoVersionId: string): Promise<StickereiStaffel[]>;
  /** Ersetzt die Staffeln eines Logos vollständig (Set-Semantik). */
  replaceStaffeln(logoVersionId: string, staffeln: ReadonlyArray<StickereiStaffel>): Promise<void>;
}

export interface StickereiStaffelResult {
  logoVersionId: string;
  staffeln: StickereiStaffelVk[];
}

export class StickereiService {
  constructor(private readonly repo: StickereiRepository) {}

  /** Stickerei-Plan einer Firma (Kap. 5.4): Weg + Digitalisierungsbedarf + Begründung. */
  async routeForCompany(companyId: string): Promise<{ companyId: string } & StickereiPlan> {
    const ctx = await this.repo.contextForCompany(companyId);
    if (!ctx) {
      throw new Error(`Firma ${companyId} nicht gefunden.`);
    }
    return { companyId, ...planStickerei(ctx) };
  }

  /** Staffeln eines Logos mit automatisch berechnetem VK je Stück (EK × 1,88) + DB. */
  async listStaffeln(logoVersionId: string): Promise<StickereiStaffelResult> {
    const raw = await this.repo.listStaffeln(logoVersionId);
    return { logoVersionId, staffeln: computeStickereiStaffelVks(raw) };
  }

  /**
   * Speichert die frei gewählten Staffeln (Stick-EK je Stück) eines Logos. Validiert
   * über die reine Logik (ganze minMenge ≥ 1, EK ≥ 0, keine Dubletten) und gibt die
   * berechneten VKs zurück. Set-Semantik: ersetzt die bisherigen Staffeln.
   */
  async saveStaffeln(
    logoVersionId: string,
    staffeln: ReadonlyArray<StickereiStaffel>
  ): Promise<StickereiStaffelResult> {
    const computed = computeStickereiStaffelVks(staffeln); // wirft bei ungültiger Eingabe
    await this.repo.replaceStaffeln(
      logoVersionId,
      staffeln.map((s) => ({ minMenge: s.minMenge, ekCents: s.ekCents }))
    );
    return { logoVersionId, staffeln: computed };
  }

  /** Gültige Staffel (EK + unser VK je Stück) für eine konkrete Bestellmenge (T-15). */
  async priceForMenge(logoVersionId: string, menge: number): Promise<StickereiStaffelVk | null> {
    const raw = await this.repo.listStaffeln(logoVersionId);
    return stickereiPriceForMenge(raw, menge);
  }
}
