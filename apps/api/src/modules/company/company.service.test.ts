// Kunden-Stammdaten (B3 / P1-4): Dedup-Anlage, Namensvalidierung, Löschschutz.

import { describe, expect, it } from "vitest";
import { CompanyError, CompanyService } from "./company.service.js";
import { InMemoryCompanyRepository } from "../../repositories/in-memory-company.repository.js";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";

function make() {
  const repo = new InMemoryCompanyRepository();
  return { repo, svc: new CompanyService(repo, new MemoryAuditSink()) };
}

describe("CompanyService.create — Dedup + Validierung (P1-4)", () => {
  it("lehnt zu kurze/leere/Whitespace-Namen ab", async () => {
    const { svc } = make();
    await expect(svc.create({ name: " ", priceGroupKind: "STANDARD" })).rejects.toBeInstanceOf(CompanyError);
    await expect(svc.create({ name: "a", priceGroupKind: "STANDARD" })).rejects.toBeInstanceOf(CompanyError);
    await expect(svc.create({ name: "   ", priceGroupKind: "STANDARD" })).rejects.toBeInstanceOf(CompanyError);
  });

  it("lehnt reine Platzhalter-/Sonderzeichennamen ab (kein Datenmüll)", async () => {
    const { svc } = make();
    await expect(svc.create({ name: "...", priceGroupKind: "STANDARD" })).rejects.toBeInstanceOf(CompanyError);
    await expect(svc.create({ name: "---", priceGroupKind: "STANDARD" })).rejects.toBeInstanceOf(CompanyError);
    // valide Kurznamen mit Ziffern bleiben erlaubt
    await expect(svc.create({ name: "3M", priceGroupKind: "STANDARD" })).resolves.toBeTruthy();
  });

  it("legt eine neue Firma getrimmt an", async () => {
    const { svc, repo } = make();
    const { id } = await svc.create({ name: "  Müller GmbH ", priceGroupKind: "STANDARD" });
    expect((await repo.list())[0]).toMatchObject({ id, name: "Müller GmbH" });
  });

  it("dedupliziert: gleicher Name (case-insensitive) liefert denselben Stammsatz, kein Duplikat", async () => {
    const { svc, repo } = make();
    const a = await svc.create({ name: "ACME AG", priceGroupKind: "STANDARD" });
    const b = await svc.create({ name: "acme ag", priceGroupKind: "TOP" });
    expect(b.id).toBe(a.id);
    expect(await repo.list()).toHaveLength(1);
  });
});

describe("CompanyService.deleteCompany — Löschschutz (P1-4)", () => {
  it("löscht eine unbenutzte Firma (Test-/Fehleingabe-Müll)", async () => {
    const { svc, repo } = make();
    const { id } = await svc.create({ name: "asd", priceGroupKind: "STANDARD" });
    await svc.deleteCompany(id);
    expect(await repo.list()).toHaveLength(0);
  });

  it("verweigert die Löschung bei verknüpften Belegen", async () => {
    const { svc, repo } = make();
    const { id } = await svc.create({ name: "Großkunde AG", priceGroupKind: "STANDARD" });
    repo.documentCounts.set(id, 3); // simuliert Aufträge/Rechnungen
    await expect(svc.deleteCompany(id)).rejects.toBeInstanceOf(CompanyError);
    expect(await repo.list()).toHaveLength(1);
  });
});
