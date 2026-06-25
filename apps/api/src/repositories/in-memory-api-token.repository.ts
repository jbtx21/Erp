import type { Role } from "@texma/shared";
import type { ApiTokenRecord, ApiTokenRepository } from "../modules/api-token/api-token.service.js";

interface Row extends ApiTokenRecord { tokenHash: string }
let seq = 0;

export class InMemoryApiTokenRepository implements ApiTokenRepository {
  private readonly rows: Row[] = [];

  async create(input: { name: string; tokenHash: string; role: Role }): Promise<ApiTokenRecord> {
    const row: Row = { id: `tok-${++seq}`, name: input.name, tokenHash: input.tokenHash, role: input.role, lastUsedAt: null, revokedAt: null, createdAt: new Date(0) };
    this.rows.push(row);
    return this.view(row);
  }
  async list(): Promise<ApiTokenRecord[]> {
    return this.rows.map((r) => this.view(r));
  }
  async findActiveByHash(tokenHash: string): Promise<ApiTokenRecord | null> {
    const r = this.rows.find((x) => x.tokenHash === tokenHash && !x.revokedAt);
    return r ? this.view(r) : null;
  }
  async revoke(id: string, at: Date): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.revokedAt = at;
  }
  async touch(id: string, at: Date): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.lastUsedAt = at;
  }
  private view(r: Row): ApiTokenRecord {
    return { id: r.id, name: r.name, role: r.role, lastUsedAt: r.lastUsedAt, revokedAt: r.revokedAt, createdAt: r.createdAt };
  }
}
