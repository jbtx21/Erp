import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryContactLinkRepository } from "../../repositories/in-memory-contact-link.repository.js";
import { ContactLinkError, ContactLinkService } from "./contact-link.service.js";

function setup() {
  const contacts = [
    { id: "p1", companyId: "acme", firstName: "Anna", lastName: "Muster", email: "anna@acme.de", phone: null, role: null },
    { id: "p2", companyId: "acme", firstName: "Bert", lastName: "Beispiel", email: null, phone: "0201", role: null },
  ];
  const repo = new InMemoryContactLinkRepository(contacts);
  const service = new ContactLinkService(repo, new MemoryAuditSink());
  return { service };
}

describe("ContactLinkService — Dynamic-Link", () => {
  it("verknüpft eine Person zusätzlich mit einer zweiten Firma", async () => {
    const { service } = setup();
    const r = await service.link("p1", "Company", "globex", "Einkauf");
    expect(r.created).toBe(true);
    const links = await service.linksForContact("p1");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ entity: "Company", entityId: "globex", role: "Einkauf" });
  });

  it("ist idempotent (gleiche Verknüpfung erneut → kein Duplikat)", async () => {
    const { service } = setup();
    await service.link("p1", "Company", "globex");
    const again = await service.link("p1", "Company", "globex");
    expect(again.created).toBe(false);
    expect(await service.linksForContact("p1")).toHaveLength(1);
  });

  it("contactsForEntity liefert Stammkontakte + Dynamic-Links einer Partei", async () => {
    const { service } = setup();
    // p1 (Stammkontakt von acme) zusätzlich an globex hängen
    await service.link("p1", "Company", "globex", "Buchhaltung");
    const acme = await service.contactsForEntity("Company", "acme");
    expect(acme.map((c) => c.contactId).sort()).toEqual(["p1", "p2"]);
    expect(acme.every((c) => c.primary)).toBe(true);

    const globex = await service.contactsForEntity("Company", "globex");
    expect(globex).toHaveLength(1);
    expect(globex[0]).toMatchObject({ contactId: "p1", primary: false, role: "Buchhaltung" });
  });

  it("lehnt nicht unterstützte Entitäten und unbekannte Kontakte ab", async () => {
    const { service } = setup();
    await expect(service.link("p1", "Invoice", "x")).rejects.toBeInstanceOf(ContactLinkError);
    await expect(service.link("nope", "Company", "globex")).rejects.toBeInstanceOf(ContactLinkError);
  });

  it("unlink entfernt die Verknüpfung", async () => {
    const { service } = setup();
    const { id } = await service.link("p1", "Lead", "lead1");
    await service.unlink(id);
    expect(await service.linksForContact("p1")).toHaveLength(0);
  });
});

describe("ContactLinkService — Stammkontakte in der Kundenmaske", () => {
  it("legt eine Person als Stammkontakt der Firma an (getrimmt)", async () => {
    const { service } = setup();
    const { id } = await service.createForCompany("acme", { firstName: " Carla ", lastName: " Chef ", email: "c@acme.de", role: "Einkauf" });
    const acme = await service.contactsForEntity("Company", "acme");
    expect(acme.find((c) => c.contactId === id)).toMatchObject({ name: "Carla Chef", firstName: "Carla", lastName: "Chef", role: "Einkauf", primary: true });
  });

  it("lehnt eine Person ohne Vor- und Nachnamen ab", async () => {
    const { service } = setup();
    await expect(service.createForCompany("acme", { firstName: " ", lastName: "" })).rejects.toBeInstanceOf(ContactLinkError);
  });

  it("bearbeitet Stammdaten (nur gesetzte Felder)", async () => {
    const { service } = setup();
    await service.updateContact("p1", { phone: "0211-1", role: "Geschäftsführung" });
    const c = (await service.contactsForEntity("Company", "acme")).find((x) => x.contactId === "p1");
    expect(c).toMatchObject({ phone: "0211-1", role: "Geschäftsführung", email: "anna@acme.de" });
  });

  it("löscht einen eigenen Stammkontakt, schützt aber fremde", async () => {
    const { service } = setup();
    await service.deleteContactForCompany("p2", "acme");
    expect(await service.contactsForEntity("Company", "acme")).toHaveLength(1);
    await expect(service.deleteContactForCompany("p1", "globex")).rejects.toBeInstanceOf(ContactLinkError);
    await expect(service.deleteContactForCompany("nope", "acme")).rejects.toBeInstanceOf(ContactLinkError);
  });
});
