import { beforeEach, describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryBankingRepository } from "../../repositories/in-memory-banking.repository.js";
import { InMemoryBankConnectionRepository } from "../../repositories/in-memory-bank-connection.repository.js";
import { InMemoryFinApiClient } from "../../repositories/in-memory-finapi-client.js";
import { BankingImportService } from "./banking-import.service.js";
import { BankConnectionService, type BankConnectionRow } from "./bank-connection.service.js";

const NOW = new Date("2026-06-20T00:00:00Z");
const conns: BankConnectionRow[] = [
  { id: "ebics", name: "Hausbank (EBICS)", kind: "EBICS", iban: "DE89370400440532013000", bic: "COBADEFFXXX", debtorName: "TEXMA GmbH", consentValidUntil: null, lastSyncAt: null, createdAt: NOW },
  { id: "psd2", name: "Sparkasse (PSD2)", kind: "PSD2", iban: "DE02500105170137075030", bic: null, debtorName: "TEXMA GmbH", consentValidUntil: new Date("2026-08-01T00:00:00Z"), lastSyncAt: null, createdAt: NOW },
  { id: "psd2old", name: "Alt (PSD2)", kind: "PSD2", iban: "DE02120300000000202051", bic: null, debtorName: "TEXMA GmbH", consentValidUntil: new Date("2026-01-01T00:00:00Z"), lastSyncAt: null, createdAt: NOW },
];

let bankingRepo: InMemoryBankingRepository;
let finApi: InMemoryFinApiClient;
let svc: BankConnectionService;

beforeEach(() => {
  bankingRepo = new InMemoryBankingRepository([{ id: "oi1", invoiceNumber: "RE-1", openCents: 10_000 }]);
  finApi = new InMemoryFinApiClient({
    creditsByConnection: {
      ebics: [
        { externalRef: "EB-1", reference: "RE-1", amountCents: 10_000 },
        { externalRef: "EB-2", reference: "UNBEKANNT", amountCents: 5_000 },
      ],
    },
  });
  const repo = new InMemoryBankConnectionRepository({ connections: conns.map((c) => ({ ...c })) });
  svc = new BankConnectionService(repo, finApi, new BankingImportService(bankingRepo, new MemoryAuditSink()), new MemoryAuditSink(), () => NOW);
});

describe("BankConnectionService – Verbindungen + Zustimmungsstatus", () => {
  it("EBICS dauerhaft gültig, PSD2 mit Ablauf, abgelaufenes PSD2 nicht ok", async () => {
    const list = await svc.listConnections();
    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    expect(byId.ebics!.consent.ok).toBe(true);
    expect(byId.ebics!.consent.validUntil).toBeNull();
    expect(byId.psd2!.consent.ok).toBe(true);
    expect(byId.psd2!.consent.validUntil).toBe("2026-08-01T00:00:00.000Z");
    expect(byId.psd2old!.consent.ok).toBe(false);
  });

  it("createConnection PSD2 ohne Datum → 90-Tage-Zustimmung ab jetzt", async () => {
    const c = await svc.createConnection({ name: "Neu", kind: "PSD2", iban: "DE89370400440532013000", debtorName: "TEXMA GmbH" });
    expect(c.consent.ok).toBe(true);
    expect(c.consent.validUntil).toBe(new Date(NOW.getTime() + 90 * 86_400_000).toISOString());
  });
});

describe("BankConnectionService – Auszug abrufen (AIS)", () => {
  it("EBICS-Sync speist Gutschriften in die Matching-Pipeline + setzt lastSyncAt", async () => {
    const { result, connection } = await svc.sync("ebics");
    expect(result).toMatchObject({ imported: 2, matched: 1, clarified: 1 });
    expect(bankingRepo.openCentsOf("oi1")).toBe(0); // RE-1 voll bezahlt
    expect(connection.lastSyncAt).toBe(NOW.toISOString());
    // Idempotenz: erneuter Sync importiert nichts Neues.
    expect((await svc.sync("ebics")).result).toMatchObject({ imported: 0, skipped: 2 });
  });

  it("PSD2-Sync mit abgelaufener Zustimmung wirft (SCA nötig)", async () => {
    await expect(svc.sync("psd2old")).rejects.toThrow(/Zustimmung/);
  });
});

describe("BankConnectionService – Zahlung auslösen (PIS)", () => {
  it("createPaymentOrder validiert IBAN/Betrag und legt DRAFT an", async () => {
    await expect(
      svc.createPaymentOrder({ connectionId: "ebics", requestedExecutionDate: "2026-06-22", transfers: [{ creditorName: "X", creditorIban: "DE00", amountCents: 100, remittance: "r" }] })
    ).rejects.toThrow(/IBAN/);
    const order = await svc.createPaymentOrder({
      connectionId: "ebics",
      requestedExecutionDate: "2026-06-22",
      transfers: [
        { creditorName: "Garn & Co", creditorIban: "DE02120300000000202051", amountCents: 12_345, remittance: "ER-5001" },
        { creditorName: "Stick", creditorIban: "DE02500105170137075030", amountCents: 5_000, remittance: "ER-5002" },
      ],
    });
    expect(order).toMatchObject({ status: "DRAFT", totalCents: 17_345, connectionName: "Hausbank (EBICS)" });
  });

  it("submitPaymentOrder reicht pain.001 ein → EXECUTED + providerRef", async () => {
    const order = await svc.createPaymentOrder({
      connectionId: "ebics",
      requestedExecutionDate: "2026-06-22",
      transfers: [{ creditorName: "Garn & Co", creditorIban: "DE02120300000000202051", amountCents: 12_345, remittance: "ER-5001" }],
    });
    const submitted = await svc.submitPaymentOrder(order.id);
    expect(submitted.status).toBe("EXECUTED");
    expect(submitted.providerRef).toMatch(/FINAPI-EBICS/);
    // Der Provider hat ein pain.001 mit der Gläubiger-IBAN erhalten.
    expect(finApi.submissions).toHaveLength(1);
    expect(finApi.submissions[0]!.pain001Xml).toContain("<IBAN>DE02120300000000202051</IBAN>");
    // Erneutes Einreichen ist nicht möglich.
    await expect(svc.submitPaymentOrder(order.id)).rejects.toThrow(/nicht im Status DRAFT/);
  });
});
