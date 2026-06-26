// GoBD-Belegarchiv-Service (Kap. 10): legt finalisierte Belege unveränderbar (WORM) im
// Objektspeicher ab und führt ein Metadaten-Register (Aufbewahrungsfrist, Legal Hold).
// Idempotent über (Quelle, QuellId, SHA-256). Liefert den GoBD/GDPdU-Z3-Export.

import {
  type ArchivedDocMeta,
  type Belegart,
  buildGobdIndexXml,
  buildGobdManifestCsv,
  earliestDeletionDate,
  retentionClassFor,
  sha256Hex,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import type { ObjectStore } from "./object-store.js";

export class ArchiveError extends Error {}

export interface ArchiveInput {
  belegart: Belegart;
  sourceEntity: string;
  sourceId: string;
  fileName: string;
  contentType: string;
  data: Uint8Array;
  userId?: string;
}

export interface ArchiveRepository {
  /** Findet einen Beleg über die fachliche Identität (idempotent). */
  findBySource(sourceEntity: string, sourceId: string, sha256: string): Promise<ArchivedDocMeta | null>;
  /** Höchste bisher vergebene Version eines logischen Belegs (Quelle/QuellId). */
  maxVersion(sourceEntity: string, sourceId: string): Promise<number>;
  create(meta: Omit<ArchivedDocMeta, "id">): Promise<ArchivedDocMeta>;
  findById(id: string): Promise<ArchivedDocMeta | null>;
  list(limit: number): Promise<ArchivedDocMeta[]>;
  listForExport(range: { from?: Date; to?: Date }): Promise<ArchivedDocMeta[]>;
  setLegalHold(id: string, hold: boolean): Promise<void>;
  /** Alle archivierten fachlichen Schlüssel (`sourceEntity|sourceId`) — Vollständigkeits-Report. */
  archivedSourceKeys(): Promise<string[]>;
  /** Jüngster Archiveintrag zu einer Quelle (für „Archiviert ✓"-Verlinkung). */
  findLatestBySource(sourceEntity: string, sourceId: string): Promise<ArchivedDocMeta | null>;
}

/** Erwarteter finaler Beleg (für den Vollständigkeits-Report). */
export interface ExpectedFinalDoc {
  type: string;
  sourceEntity: string;
  sourceId: string;
  label: string;
}

export interface GobdExport {
  indexXml: string;
  manifestCsv: string;
  count: number;
}

export class ArchiveService {
  constructor(
    private readonly store: ObjectStore,
    private readonly repo: ArchiveRepository,
    private readonly audit: AuditSink,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** Beleg unveränderbar archivieren. Gleicher Inhalt für dieselbe Quelle ⇒ idempotent. */
  async archive(input: ArchiveInput): Promise<ArchivedDocMeta> {
    if (input.data.length === 0) throw new ArchiveError("Leerer Beleg kann nicht archiviert werden.");
    const sha = sha256Hex(input.data);
    const existing = await this.repo.findBySource(input.sourceEntity, input.sourceId, sha);
    if (existing) return existing; // bereits archiviert (identischer Inhalt)

    await this.store.put(sha, input.data);
    const archivedAt = this.now();
    const version = (await this.repo.maxVersion(input.sourceEntity, input.sourceId)) + 1;
    const meta = await this.repo.create({
      belegart: input.belegart,
      sourceEntity: input.sourceEntity,
      sourceId: input.sourceId,
      fileName: input.fileName,
      contentType: input.contentType,
      sha256: sha,
      size: input.data.length,
      version,
      retentionClass: retentionClassFor(input.belegart),
      archivedAt,
      earliestDeletion: earliestDeletionDate(archivedAt, input.belegart),
      legalHold: false,
    });
    await this.audit.append(
      buildEntry({
        userId: input.userId,
        entity: "ArchivedDocument",
        entityId: meta.id,
        action: "FINALIZE",
        after: { sha256: sha, belegart: input.belegart, sourceId: input.sourceId, version },
      })
    );
    return meta;
  }

  /** Beleg samt Bytes lesen — der Hash wird beim Lesen geprüft (Manipulationserkennung). */
  async retrieve(id: string): Promise<{ meta: ArchivedDocMeta; data: Uint8Array } | null> {
    const meta = await this.repo.findById(id);
    if (!meta) return null;
    const data = await this.store.get(meta.sha256);
    if (!data) throw new ArchiveError(`Archiv-Inhalt fehlt für ${id} (${meta.sha256}).`);
    if (sha256Hex(data) !== meta.sha256) {
      throw new ArchiveError(`GoBD-Integritätsverstoß: ${id} wurde manipuliert (Hash stimmt nicht).`);
    }
    return { meta, data };
  }

  list(limit = 50): Promise<ArchivedDocMeta[]> {
    return this.repo.list(limit);
  }

  /**
   * Vollständigkeits-Report (P2): liefert aus den erwarteten finalen Belegen jene, für die
   * KEIN Archiveintrag existiert. Sollte nach Auto-Archivierung + Backfill leer sein.
   */
  async missingFrom(expected: ExpectedFinalDoc[]): Promise<ExpectedFinalDoc[]> {
    const keys = new Set(await this.repo.archivedSourceKeys());
    return expected.filter((e) => !keys.has(`${e.sourceEntity}|${e.sourceId}`));
  }

  /** Jüngster Archiveintrag zu einer Quelle (id + sha) oder null — für „Archiviert ✓". */
  findLatestBySource(sourceEntity: string, sourceId: string): Promise<ArchivedDocMeta | null> {
    return this.repo.findLatestBySource(sourceEntity, sourceId);
  }

  /** Legal Hold setzen/aufheben (sperrt über die normale Frist hinaus). */
  async setLegalHold(id: string, hold: boolean, userId?: string): Promise<void> {
    await this.repo.setLegalHold(id, hold);
    await this.audit.append(buildEntry({ userId, entity: "ArchivedDocument", entityId: id, action: "UPDATE", after: { legalHold: hold } }));
  }

  /** GoBD/GDPdU-„Z3"-Export (index.xml + manifest.csv) über einen Zeitraum. */
  async buildGobdExport(range: { from?: Date; to?: Date } = {}): Promise<GobdExport> {
    const docs = await this.repo.listForExport(range);
    return {
      manifestCsv: buildGobdManifestCsv(docs),
      indexXml: buildGobdIndexXml({ manifestFile: "manifest.csv", rowCount: docs.length, createdAt: this.now() }),
      count: docs.length,
    };
  }
}
