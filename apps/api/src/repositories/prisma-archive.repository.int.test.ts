// Integrationstest gegen ECHTES Postgres: das Archiv-Register schreibt unveränderbar,
// ist über (Quelle, QuellId, SHA-256) idempotent und versioniert Neufassungen. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { sha256Hex } from "@texma/shared";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { ArchiveService } from "../modules/archive/archive.service.js";
import { InMemoryObjectStore } from "../modules/archive/object-store.js";
import { PrismaArchiveRepository } from "./prisma-archive.repository.js";

const SRC = "IntTest";
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);
const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaArchiveRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaArchiveRepository — GoBD-Belegarchiv gegen echtes Postgres", () => {
    const service = new ArchiveService(new InMemoryObjectStore(), new PrismaArchiveRepository(), new MemoryAuditSink());

    async function cleanup() {
      await prisma.archivedDocument.deleteMany({ where: { sourceEntity: SRC } });
    }
    beforeAll(cleanup);
    afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

    it("archiviert idempotent und versioniert Neufassungen", async () => {
      const a = await service.archive({ belegart: "RECHNUNG", sourceEntity: SRC, sourceId: "RE-1", fileName: "re.pdf", contentType: "application/pdf", data: bytes("v1") });
      expect(a.version).toBe(1);
      expect(a.sha256).toBe(sha256Hex(bytes("v1")));

      // identischer Inhalt → kein zweiter Eintrag
      const again = await service.archive({ belegart: "RECHNUNG", sourceEntity: SRC, sourceId: "RE-1", fileName: "re.pdf", contentType: "application/pdf", data: bytes("v1") });
      expect(again.id).toBe(a.id);

      // abweichender Inhalt → Version 2
      const v2 = await service.archive({ belegart: "RECHNUNG", sourceEntity: SRC, sourceId: "RE-1", fileName: "re.pdf", contentType: "application/pdf", data: bytes("v2") });
      expect(v2.version).toBe(2);

      const list = await service.list(50);
      expect(list.filter((d) => d.sourceEntity === SRC).length).toBe(2);
    });

    it("GoBD-Export liefert die Belege des Zeitraums", async () => {
      const exp = await service.buildGobdExport({});
      expect(exp.count).toBeGreaterThanOrEqual(2);
      expect(exp.indexXml).toContain("gdpdu-01-09-2004.dtd");
    });
  });
}
