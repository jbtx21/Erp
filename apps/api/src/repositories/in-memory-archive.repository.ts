// In-Memory-Archiv-Register für Tests.
import type { ArchivedDocMeta } from "@texma/shared";
import type { ArchiveRepository } from "../modules/archive/archive.service.js";

export class InMemoryArchiveRepository implements ArchiveRepository {
  private seq = 0;
  private readonly docs: ArchivedDocMeta[] = [];

  async findBySource(sourceEntity: string, sourceId: string, sha256: string): Promise<ArchivedDocMeta | null> {
    return this.docs.find((d) => d.sourceEntity === sourceEntity && d.sourceId === sourceId && d.sha256 === sha256) ?? null;
  }
  async maxVersion(sourceEntity: string, sourceId: string): Promise<number> {
    return this.docs
      .filter((d) => d.sourceEntity === sourceEntity && d.sourceId === sourceId)
      .reduce((m, d) => Math.max(m, d.version), 0);
  }
  async create(meta: Omit<ArchivedDocMeta, "id">): Promise<ArchivedDocMeta> {
    const doc: ArchivedDocMeta = { ...meta, id: `arc_${String(++this.seq)}` };
    this.docs.push(doc);
    return doc;
  }
  async findById(id: string): Promise<ArchivedDocMeta | null> {
    return this.docs.find((d) => d.id === id) ?? null;
  }
  async list(limit: number): Promise<ArchivedDocMeta[]> {
    return [...this.docs].sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime()).slice(0, limit);
  }
  async listForExport(range: { from?: Date; to?: Date }): Promise<ArchivedDocMeta[]> {
    return this.docs.filter(
      (d) => (!range.from || d.archivedAt >= range.from) && (!range.to || d.archivedAt <= range.to)
    );
  }
  async setLegalHold(id: string, hold: boolean): Promise<void> {
    const d = this.docs.find((x) => x.id === id);
    if (d) d.legalHold = hold;
  }
  async archivedSourceKeys(): Promise<string[]> {
    return [...new Set(this.docs.map((d) => `${d.sourceEntity}|${d.sourceId}`))];
  }
}
