// Qualitätssicherung (QS-Gate vor dem Versand). Prüfpunkte je Auftrag: Stückzahl kontrolliert,
// externe Veredelung kontrolliert, Foto gemacht. Erst wenn alle drei erfüllt sind, gilt der
// Auftrag als BESTANDEN und wird vom Versand (listShippable) berücksichtigt.

import { buildEntry, type AuditSink } from "@texma/audit";

export type QualityStatus = "OFFEN" | "BESTANDEN";

export interface QualityCheck {
  orderId: string;
  status: QualityStatus;
  stueckzahlOk: boolean;
  veredelungOk: boolean;
  fotoOk: boolean;
  notiz: string | null;
  geprueftAm: Date | null;
}

/** Teilangaben beim Setzen der Prüfpunkte (nur übergebene Felder werden geändert). */
export interface QualityPatch {
  stueckzahlOk?: boolean;
  veredelungOk?: boolean;
  fotoOk?: boolean;
  notiz?: string | null;
}

export interface QualityRepository {
  get(orderId: string): Promise<QualityCheck | null>;
  /** Setzt die Prüfpunkte + abgeleiteten Status; @returns false, wenn der Auftrag fehlt. */
  update(orderId: string, data: { stueckzahlOk: boolean; veredelungOk: boolean; fotoOk: boolean; notiz: string | null; status: QualityStatus; geprueftAm: Date | null }): Promise<boolean>;
}

export class QualityError extends Error {}

export class QualityService {
  constructor(private readonly repo: QualityRepository, private readonly audit: AuditSink) {}

  async get(orderId: string): Promise<QualityCheck> {
    const qc = await this.repo.get(orderId);
    if (!qc) throw new QualityError(`Auftrag ${orderId} nicht gefunden.`);
    return qc;
  }

  /**
   * Setzt die QS-Prüfpunkte und leitet den Status ab: BESTANDEN nur, wenn Stückzahl + externe
   * Veredelung + Foto kontrolliert sind. Sonst zurück auf OFFEN (Gate schließt wieder).
   */
  async check(orderId: string, patch: QualityPatch, at: Date = new Date()): Promise<QualityCheck> {
    const cur = await this.repo.get(orderId);
    if (!cur) throw new QualityError(`Auftrag ${orderId} nicht gefunden.`);
    const stueckzahlOk = patch.stueckzahlOk ?? cur.stueckzahlOk;
    const veredelungOk = patch.veredelungOk ?? cur.veredelungOk;
    const fotoOk = patch.fotoOk ?? cur.fotoOk;
    const notiz = patch.notiz !== undefined ? patch.notiz : cur.notiz;
    const bestanden = stueckzahlOk && veredelungOk && fotoOk;
    const status: QualityStatus = bestanden ? "BESTANDEN" : "OFFEN";
    const geprueftAm = bestanden ? (cur.geprueftAm ?? at) : null;
    await this.repo.update(orderId, { stueckzahlOk, veredelungOk, fotoOk, notiz, status, geprueftAm });
    await this.audit.append(buildEntry({
      entity: "Order", entityId: orderId, action: "UPDATE",
      after: { qs: status, stueckzahlOk, veredelungOk, fotoOk },
    }));
    return { orderId, status, stueckzahlOk, veredelungOk, fotoOk, notiz, geprueftAm };
  }
}
