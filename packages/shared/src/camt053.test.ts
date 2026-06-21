import { describe, expect, it } from "vitest";
import { creditTransactions, parseCamt053 } from "./camt053.js";

const camt = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt><Stmt>
    <Ntry>
      <Amt Ccy="EUR">119.00</Amt>
      <CdtDbtInd>CRDT</CdtDbtInd>
      <ValDt><Dt>2026-06-15</Dt></ValDt>
      <NtryDtls><TxDtls>
        <Refs><AcctSvcrRef>ACME-REF-1</AcctSvcrRef><EndToEndId>E2E-1</EndToEndId></Refs>
        <RmtInf><Ustrd>Zahlung Rechnung R-2026-001</Ustrd></RmtInf>
      </TxDtls></NtryDtls>
    </Ntry>
    <Ntry>
      <Amt Ccy="EUR">50.00</Amt>
      <CdtDbtInd>DBIT</CdtDbtInd>
      <ValDt><Dt>2026-06-16</Dt></ValDt>
      <NtryDtls><TxDtls>
        <Refs><AcctSvcrRef>FEE-1</AcctSvcrRef></Refs>
        <RmtInf><Ustrd>Kontoführung</Ustrd></RmtInf>
      </TxDtls></NtryDtls>
    </Ntry>
  </Stmt></BkToCstmrStmt>
</Document>`;

describe("parseCamt053 (T-13)", () => {
  it("parst Buchungseinträge mit Betrag, Soll/Haben, Referenz und Verwendungszweck", () => {
    const txns = parseCamt053(camt);
    expect(txns).toHaveLength(2);
    expect(txns[0]).toMatchObject({
      externalRef: "ACME-REF-1",
      reference: "Zahlung Rechnung R-2026-001",
      amountCents: 11900,
      creditDebit: "CRDT",
    });
    expect(txns[0]?.valueDate?.toISOString().slice(0, 10)).toBe("2026-06-15");
    expect(txns[1]).toMatchObject({ externalRef: "FEE-1", amountCents: 5000, creditDebit: "DBIT" });
  });

  it("filtert auf Zahlungseingänge (Haben)", () => {
    const credits = creditTransactions(parseCamt053(camt));
    expect(credits).toHaveLength(1);
    expect(credits[0]?.externalRef).toBe("ACME-REF-1");
  });

  it("fällt für externalRef auf EndToEndId bzw. zusammengesetzten Schlüssel zurück", () => {
    const xml = `<Document><Ntry><Amt>10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><ValDt><Dt>2026-01-02</Dt></ValDt>
      <RmtInf><Ustrd>R-9</Ustrd></RmtInf></Ntry></Document>`;
    const t = parseCamt053(xml)[0]!;
    expect(t.externalRef).toBe("2026-01-02|1000|R-9");
  });
});
