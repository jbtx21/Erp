// Prisma-Archiv-Register (Produktionspfad) für den ArchiveService.
import { prisma } from "@texma/db";
import type { ArchivedDocMeta, Belegart, RetentionClass } from "@texma/shared";
import type { ArchiveRepository } from "../modules/archive/archive.service.js";

type Row = Awaited<ReturnType<typeof prisma.archivedDocument.findFirst>>;

function map(r: NonNullable<Row>): ArchivedDocMeta {
  return {
    id: r.id,
    belegart: r.belegart as Belegart,
    sourceEntity: r.sourceEntity,
    sourceId: r.sourceId,
    fileName: r.fileName,
    contentType: r.contentType,
    sha256: r.sha256,
    size: r.size,
    version: r.version,
    retentionClass: r.retentionClass as RetentionClass,
    archivedAt: r.archivedAt,
    earliestDeletion: r.earliestDeletion,
    legalHold: r.legalHold,
  };
}

export class PrismaArchiveRepository implements ArchiveRepository {
  async findBySource(sourceEntity: string, sourceId: string, sha256: string): Promise<ArchivedDocMeta | null> {
    const r = await prisma.archivedDocument.findUnique({ where: { sourceEntity_sourceId_sha256: { sourceEntity, sourceId, sha256 } } });
    return r ? map(r) : null;
  }
  async maxVersion(sourceEntity: string, sourceId: string): Promise<number> {
    const agg = await prisma.archivedDocument.aggregate({ where: { sourceEntity, sourceId }, _max: { version: true } });
    return agg._max.version ?? 0;
  }
  async create(meta: Omit<ArchivedDocMeta, "id">): Promise<ArchivedDocMeta> {
    const r = await prisma.archivedDocument.create({
      data: {
        belegart: meta.belegart,
        sourceEntity: meta.sourceEntity,
        sourceId: meta.sourceId,
        fileName: meta.fileName,
        contentType: meta.contentType,
        sha256: meta.sha256,
        size: meta.size,
        version: meta.version,
        storageKey: meta.sha256,
        retentionClass: meta.retentionClass,
        archivedAt: meta.archivedAt,
        earliestDeletion: meta.earliestDeletion,
        legalHold: meta.legalHold,
      },
    });
    return map(r);
  }
  async findById(id: string): Promise<ArchivedDocMeta | null> {
    const r = await prisma.archivedDocument.findUnique({ where: { id } });
    return r ? map(r) : null;
  }
  async list(limit: number): Promise<ArchivedDocMeta[]> {
    const rows = await prisma.archivedDocument.findMany({ orderBy: { archivedAt: "desc" }, take: limit });
    return rows.map(map);
  }
  async listForExport(range: { from?: Date; to?: Date }): Promise<ArchivedDocMeta[]> {
    const rows = await prisma.archivedDocument.findMany({
      where: { archivedAt: { gte: range.from, lte: range.to } },
      orderBy: { archivedAt: "asc" },
    });
    return rows.map(map);
  }
  async setLegalHold(id: string, hold: boolean): Promise<void> {
    await prisma.archivedDocument.update({ where: { id }, data: { legalHold: hold } });
  }
}
