// Gutschein-Registry (Xentral „Gutscheine"): anlegen, Restguthaben/Gültigkeit, einlösen.
// Bindet die reine `redeemGutschein`/`isGutscheinValid`-Logik an die Persistenz; jede
// Einlösung wird GoBD-auditiert. Reine Anwendungslogik über ein Repository-Interface.

import { redeemGutschein, isGutscheinValid, GutscheinError } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface GutscheinRecord {
  id: string;
  code: string;
  initialCents: number;
  remainingCents: number;
  validUntil: Date | null;
  note: string | null;
  active: boolean;
  createdAt: Date;
}

export interface GutscheinRepository {
  list(): Promise<GutscheinRecord[]>;
  findByCode(code: string): Promise<GutscheinRecord | null>;
  create(input: { code: string; initialCents: number; validUntil: Date | null; note: string | null }): Promise<GutscheinRecord>;
  setRemaining(id: string, remainingCents: number): Promise<void>;
}

export class GutscheinService {
  constructor(
    private readonly repo: GutscheinRepository,
    private readonly audit: AuditSink,
    private readonly now: () => Date = () => new Date()
  ) {}

  list(): Promise<GutscheinRecord[]> {
    return this.repo.list();
  }

  /** Legt einen Gutschein an (Code eindeutig; Restguthaben = Ausstellungswert). */
  async create(input: { code: string; initialCents: number; validUntil?: Date | null; note?: string | null }): Promise<GutscheinRecord> {
    const code = input.code.trim().toUpperCase();
    if (!code) throw new GutscheinError("Code darf nicht leer sein.");
    if (input.initialCents <= 0) throw new GutscheinError("Wert muss positiv sein.");
    if (await this.repo.findByCode(code)) throw new GutscheinError(`Gutschein-Code „${code}" existiert bereits.`);
    const rec = await this.repo.create({ code, initialCents: input.initialCents, validUntil: input.validUntil ?? null, note: input.note ?? null });
    await this.audit.append(buildEntry({ entity: "Gutschein", entityId: rec.id, action: "CREATE", after: { code, initialCents: input.initialCents } }));
    return rec;
  }

  /** Löst einen Betrag gegen einen Gutschein ein (Teil-Einlösung möglich); auditiert. */
  async redeem(code: string, amountCents: number): Promise<{ appliedCents: number; remainingCents: number }> {
    const g = await this.repo.findByCode(code.trim().toUpperCase());
    if (!g) throw new GutscheinError("Gutschein nicht gefunden.");
    if (!isGutscheinValid(g, this.now())) throw new GutscheinError("Gutschein ist nicht gültig (inaktiv, abgelaufen oder leer).");
    const { appliedCents, remainingCents } = redeemGutschein(g.remainingCents, amountCents);
    await this.repo.setRemaining(g.id, remainingCents);
    await this.audit.append(buildEntry({ entity: "Gutschein", entityId: g.id, action: "UPDATE", before: { remainingCents: g.remainingCents }, after: { appliedCents, remainingCents } }));
    return { appliedCents, remainingCents };
  }
}
