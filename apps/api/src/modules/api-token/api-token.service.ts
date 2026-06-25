// Personal Access Token (PAT, Xentral-Vorbild): Ausstellen/Verwalten/Prüfen von API-Tokens
// für den read-only REST-Zugriff (externe Agenten/MCP). Nur der SHA-256-Hash wird
// gespeichert; der Klartext ist einmalig bei der Ausstellung sichtbar. RBAC über die Rolle.

import type { Role } from "@texma/shared";
import { randomToken, hashToken } from "../auth/token.js";
import { buildEntry, type AuditSink } from "@texma/audit";

export class ApiTokenError extends Error {}

export interface ApiTokenRecord {
  id: string;
  name: string;
  role: Role;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface ApiTokenRepository {
  create(input: { name: string; tokenHash: string; role: Role }): Promise<ApiTokenRecord>;
  list(): Promise<ApiTokenRecord[]>;
  findActiveByHash(tokenHash: string): Promise<ApiTokenRecord | null>;
  revoke(id: string, at: Date): Promise<void>;
  touch(id: string, at: Date): Promise<void>;
}

export class ApiTokenService {
  constructor(
    private readonly repo: ApiTokenRepository,
    private readonly audit: AuditSink,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** Stellt ein Token aus. Gibt den Klartext EINMALIG zurück (danach nur noch der Hash). */
  async create(name: string, role: Role): Promise<{ token: string; record: ApiTokenRecord }> {
    if (!name.trim()) throw new ApiTokenError("Name ist Pflicht.");
    const token = `texma_pat_${randomToken()}`;
    const rec = await this.repo.create({ name: name.trim(), tokenHash: hashToken(token), role });
    await this.audit.append(buildEntry({ entity: "ApiToken", entityId: rec.id, action: "CREATE", after: { name: rec.name, role } }));
    return { token, record: rec };
  }

  list(): Promise<ApiTokenRecord[]> {
    return this.repo.list();
  }

  async revoke(id: string): Promise<void> {
    await this.repo.revoke(id, this.now());
    await this.audit.append(buildEntry({ entity: "ApiToken", entityId: id, action: "UPDATE", after: { revoked: true } }));
  }

  /** Prüft ein Bearer-Token; bei Erfolg `lastUsedAt` aktualisieren und Rolle liefern. */
  async verify(token: string): Promise<{ tokenId: string; role: Role } | null> {
    if (!token) return null;
    const rec = await this.repo.findActiveByHash(hashToken(token));
    if (!rec || rec.revokedAt) return null;
    await this.repo.touch(rec.id, this.now());
    return { tokenId: rec.id, role: rec.role };
  }
}
