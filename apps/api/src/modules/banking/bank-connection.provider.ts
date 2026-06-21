// Bank-Anbindung (Kap. 9): EINE Abstraktion, zwei Wege — EBICS und PSD2/XS2A — hinter
// einem gemeinsamen Provider-Interface. Beide liefern normalisierte Gutschriften in die
// vorhandene Matching-Pipeline (T-13) und nehmen pain.001-Zahlungen entgegen (PIS). Die
// Low-Level-Boundary (finAPI-REST / EBICS-Bankserver) ist als FinApiClient injiziert und
// in Demo/Tests durch eine In-Memory-Variante ersetzbar.

import { creditTransactions, parseCamt053 } from "@texma/shared";

export type BankConnectionKind = "EBICS" | "PSD2";

/** Verbindungsdaten, die der Provider braucht (aus der DB; Secrets bewusst minimal). */
export interface BankConnectionInfo {
  id: string;
  name: string;
  kind: BankConnectionKind;
  iban: string;
  bic?: string | null;
  debtorName: string;
  /** PSD2: Ablauf der SCA-Zustimmung (90 Tage); EBICS: null (zertifikatsbasiert). */
  consentValidUntil?: Date | null;
}

/** Normalisierte Bank-Gutschrift, gespeist in die Matching-Pipeline. */
export interface NormalizedCredit {
  externalRef: string;
  reference: string;
  amountCents: number;
  bookedAt?: Date;
}

/** Ergebnis einer Zahlungseinreichung beim Provider. */
export interface SubmitResult {
  providerRef: string;
  accepted: boolean;
  message?: string;
}

/** Zustimmungs-/Verbindungsstatus (für die UI). */
export interface ConsentStatus {
  ok: boolean;
  validUntil?: Date | null;
  note: string;
}

/**
 * Low-Level-Boundary zum Bank-Backend. Produktiv ein HTTP-Client (finAPI-REST bzw.
 * EBICS-Bankserver); in Demo/Tests eine In-Memory-Implementierung.
 */
export interface FinApiClient {
  /** EBICS C53: CAMT.053-Auszug als XML. */
  downloadCamt053(conn: BankConnectionInfo): Promise<string>;
  /** PSD2 AIS: bereits normalisierte Transaktionen. */
  fetchTransactions(conn: BankConnectionInfo): Promise<NormalizedCredit[]>;
  /** EBICS CCT / PSD2 PIS: pain.001 einreichen. */
  submitPain001(conn: BankConnectionInfo, pain001Xml: string): Promise<SubmitResult>;
}

/** Einheitliche Bank-Anbindung; kapselt die Unterschiede EBICS vs. PSD2. */
export interface BankConnectionProvider {
  readonly kind: BankConnectionKind;
  /** Holt neue Gutschriften (EBICS: CAMT.053→parsen; PSD2: Transaktions-API). */
  fetchCredits(conn: BankConnectionInfo, now?: Date): Promise<NormalizedCredit[]>;
  /** Reicht eine pain.001-SEPA-Überweisung ein. */
  submitPayment(conn: BankConnectionInfo, pain001Xml: string, now?: Date): Promise<SubmitResult>;
  /** Zustimmungs-/Verbindungsstatus (PSD2: 90-Tage-SCA; EBICS: dauerhaft). */
  consentStatus(conn: BankConnectionInfo, now?: Date): ConsentStatus;
}

/** EBICS: zertifikatsbasiert, liefert CAMT.053, keine 90-Tage-Re-Autorisierung. */
class EbicsProvider implements BankConnectionProvider {
  readonly kind = "EBICS" as const;
  constructor(private readonly client: FinApiClient) {}

  async fetchCredits(conn: BankConnectionInfo): Promise<NormalizedCredit[]> {
    const xml = await this.client.downloadCamt053(conn);
    return creditTransactions(parseCamt053(xml)).map((c) => ({
      externalRef: c.externalRef,
      reference: c.reference,
      amountCents: c.amountCents,
    }));
  }

  submitPayment(conn: BankConnectionInfo, xml: string): Promise<SubmitResult> {
    return this.client.submitPain001(conn, xml);
  }

  consentStatus(): ConsentStatus {
    return { ok: true, validUntil: null, note: "EBICS: zertifikatsbasiert, keine Re-Autorisierung nötig." };
  }
}

/** PSD2/XS2A: Transaktions-API, aber 90-Tage-SCA-Zustimmung (re-consent). */
class Psd2Provider implements BankConnectionProvider {
  readonly kind = "PSD2" as const;
  constructor(private readonly client: FinApiClient) {}

  async fetchCredits(conn: BankConnectionInfo, now = new Date()): Promise<NormalizedCredit[]> {
    this.assertConsent(conn, now);
    return this.client.fetchTransactions(conn);
  }

  submitPayment(conn: BankConnectionInfo, xml: string, now = new Date()): Promise<SubmitResult> {
    this.assertConsent(conn, now);
    return this.client.submitPain001(conn, xml);
  }

  consentStatus(conn: BankConnectionInfo, now = new Date()): ConsentStatus {
    const validUntil = conn.consentValidUntil ?? null;
    if (!validUntil) return { ok: false, validUntil: null, note: "PSD2: keine Zustimmung erteilt." };
    const ok = validUntil.getTime() > now.getTime();
    const days = Math.ceil((validUntil.getTime() - now.getTime()) / 86_400_000);
    return {
      ok,
      validUntil,
      note: ok
        ? `PSD2: Zustimmung gültig (noch ${days} Tag(e)).`
        : "PSD2: Zustimmung abgelaufen — SCA-Re-Autorisierung nötig.",
    };
  }

  private assertConsent(conn: BankConnectionInfo, now: Date): void {
    if (!this.consentStatus(conn, now).ok) {
      throw new Error("PSD2-Zustimmung abgelaufen/fehlt — bitte erneut autorisieren (SCA).");
    }
  }
}

/** Wählt den Provider passend zur Verbindungsart. */
export function providerFor(kind: BankConnectionKind, client: FinApiClient): BankConnectionProvider {
  return kind === "EBICS" ? new EbicsProvider(client) : new Psd2Provider(client);
}
