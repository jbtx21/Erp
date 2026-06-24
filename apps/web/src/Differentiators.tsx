// Differenzierer-Durchstich (Moat, Leitplanke 1): macht die vier selbst gebauten
// TEXMA-Spezialmodule am echten Endpunkt sichtbar — Ampel-Terminübersicht (Kap. 35.4),
// Stickerei-Mengenstaffeln je Logo (Kap. 4.4/5.4), Fremdvergabe-Plan (T-04/Kap. 5.3) und
// Nachkalkulation Soll-Ist (T-10). Preis-sensible Module sind für PRODUKTION ausgeblendet
// (Kap. 12) — die Endpunkte erzwingen die Rolle zusätzlich serverseitig. UI: Mantine.
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { Anchor, Badge, Button, Card, Checkbox, FileInput, Group, NumberInput, Select, Table, Text, TextInput, Title } from "@mantine/core";
import {
  computeStickereiStaffelVks,
  stickereiPriceForMenge,
  type StaffelMarkup,
  type StickereiStaffel,
} from "@texma/shared/stickerei";
import {
  DEFAULT_MARKUP_CONFIG,
  resolveMarkupFactor,
  type FinishingType,
  type MarkupConfig,
  type MarkupRule,
} from "@texma/shared/markup";
import { trpc } from "./trpc.js";
import { euro, numTd, statusMantineColor, statusOf } from "./theme.js";

/** Ampel-Status als Badge: Farbe + Text (Skill erp-ui-design: Signal nie allein über Farbe). */
function StatusBadge({ s }: { s: string }): JSX.Element {
  return <Badge color={statusMantineColor[s] ?? "gray"} variant="light" radius="sm">{statusOf(s).label}</Badge>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Die Sammelseite ist aufgelöst: Aufschlagsfaktoren → Einstellungen, Logo-Verwaltung +
// Stickerei-Weg → Stammdaten, Stickerei-Staffeln → Angebot/Auftrag, Ausschreibung →
// Beschaffung, Nachkalkulation → Produktion-Reporting + Finanzen, Termin-Ampel → Übersicht.
// Es verbleibt nur die mehrstufige Fremdvergabe (Einordnung noch in Klärung).
export function Differentiators({ role }: { role: string }): JSX.Element {
  return (
    <>
      <Title order={2}>Mehrstufige Fremdvergabe</Title>
      <Text size="sm" c="dimmed">
        Plan + Aktionen je Produktionsauftrag (T-04). Hinweis: Diese Funktion gibt es auch
        unter Produktion → Fremdvergabe — die Zusammenführung ist noch in Abstimmung.
      </Text>
      <SubproductionPlan role={role} />
    </>
  );
}

// ── Preis-Werkzeuge (preis-sensibel): Aufschlagsfaktoren + Logos + Stickerei-Staffeln ──
// Aufschlags-Konfiguration + Logo-Liste werden einmal geladen und geteilt, damit die
// Staffel-Live-Berechnung dieselben Faktoren/Regeln nutzt wie der Server und das Anlegen
// einer Logo-Version den Picker sofort aktualisiert.
type LogoOption = { id: string; label: string; companyId?: string; companyName?: string; version?: number; active?: boolean; fileName?: string };

/** Liest eine Datei als base64 (ohne data:-Präfix) für den Upload über tRPC. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.slice(res.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ── Modulare Sektionen (an die richtigen Module verteilt, statt Sammelseite) ──────
// Jede Sektion lädt ihre eigenen Daten (Aufschlags-Konfig / Logo-Liste) und rendert
// die passende Karte. So liegen Aufschlagsfaktoren in Einstellungen, Logo-Verwaltung
// in den Stammdaten, Ausschreibungen in der Beschaffung usw.

/** Aufschlagsfaktoren-Konfiguration (→ Einstellungen). */
export function AufschlagsfaktorenSection(): JSX.Element {
  const [config, setConfig] = useState<MarkupConfig | null>(null);
  useEffect(() => {
    void (async () => {
      try { setConfig((await trpc.stickerei.markup.getConfig.query()) as MarkupConfig); }
      catch { setConfig(DEFAULT_MARKUP_CONFIG); }
    })();
  }, []);
  return <MarkupConfigCard config={config} onSaved={setConfig} />;
}

/** Logo-Verwaltung + Stickerei-Weg je Firma (→ Stammdaten). */
export function LogosStickereiSection(): JSX.Element {
  const [logos, setLogos] = useState<LogoOption[]>([]);
  const reloadLogos = useCallback(async () => {
    try { setLogos(await trpc.stickerei.logos.list.query()); } catch { /* Picker bleibt leer */ }
  }, []);
  useEffect(() => { void reloadLogos(); }, [reloadLogos]);
  return (
    <>
      <LogoVerwaltung logos={logos} onChanged={reloadLogos} />
      <StickereiRouteCard />
    </>
  );
}

/** Stickerei-Mengenstaffeln je Logo (→ Angebot-/Auftrags-Erfassung). */
export function StickereiStaffelnSection(): JSX.Element {
  const [config, setConfig] = useState<MarkupConfig | null>(null);
  const [logos, setLogos] = useState<LogoOption[]>([]);
  useEffect(() => {
    void (async () => {
      try { setConfig((await trpc.stickerei.markup.getConfig.query()) as MarkupConfig); }
      catch { setConfig(DEFAULT_MARKUP_CONFIG); }
      try { setLogos(await trpc.stickerei.logos.list.query()); } catch { /* leer */ }
    })();
  }, []);
  return <StickereiStaffeln config={config} logos={logos} />;
}

/** Ausschreibung je Logo an Stickerei-Partner (→ Beschaffung). */
export function StickereiAusschreibungSection(): JSX.Element {
  const [logos, setLogos] = useState<LogoOption[]>([]);
  const reloadLogos = useCallback(async () => {
    try { setLogos(await trpc.stickerei.logos.list.query()); } catch { /* leer */ }
  }, []);
  useEffect(() => { void reloadLogos(); }, [reloadLogos]);
  return <StickereiAusschreibungen logos={logos} onDecided={reloadLogos} />;
}

// ── Stickerei-Weg (Kap. 5.4): Direktauftrag vs. Ausschreibung je Firma ───────────
// Wiederholer mit hinterlegtem Partner UND Stickdatei → Direktauftrag (Fremdvergabe an
// den Partner). Neues Logo / kein Partner → Ausschreibung; ohne Stickdatei zusätzlich
// Digitalisierung (Punch) nötig. Macht den von decideStickereiRoute ermittelten Weg sichtbar.
function StickereiRouteCard(): JSX.Element {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [savingPartner, setSavingPartner] = useState(false);
  const [partnerMsg, setPartnerMsg] = useState<string | null>(null);
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof trpc.stickerei.routeForCompany.query>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { void (async () => {
    try { setCompanies(await trpc.stickerei.companies.query()); } catch { /* leer */ }
    try { setSuppliers((await trpc.suppliers.listAll.query()).map((s) => ({ id: s.id, name: s.name }))); } catch { /* leer */ }
  })(); }, []);
  const choose = async (id: string): Promise<void> => {
    setCompanyId(id); setPlan(null); setErr(null); setPartnerMsg(null);
    if (!id) { setPartnerId(null); return; }
    try { const p = await trpc.stickerei.routeForCompany.query({ companyId: id }); setPlan(p); setPartnerId(p.stickereiPartnerId); }
    catch (e) { setErr(errMsg(e)); }
  };
  const savePartner = async (): Promise<void> => {
    if (!companyId) return;
    setSavingPartner(true); setPartnerMsg(null); setErr(null);
    try {
      await trpc.stickerei.setPartner.mutate({ companyId, supplierId: partnerId });
      const p = await trpc.stickerei.routeForCompany.query({ companyId }); setPlan(p); setPartnerId(p.stickereiPartnerId);
      setPartnerMsg("Stickerei-Partner gespeichert.");
    } catch (e) { setErr(errMsg(e)); } finally { setSavingPartner(false); }
  };

  const direkt = plan?.route === "DIREKT";
  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Stickerei-Weg (Kap. 5.4)</Title>
      <Text size="sm" c="dimmed" mt={4}>
        Firma wählen — das System entscheidet Direktauftrag (Partner + Stickdatei vorhanden) oder Ausschreibung (neues Logo / kein Partner).
      </Text>
      <Group mt="sm" align="end" gap="md" wrap="wrap">
        <Select label="Firma" placeholder="Firma wählen…" searchable w={280} value={companyId || null}
          data={companies.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => void choose(v ?? "")} />
        {plan && (
          <Group gap="xs">
            <Badge size="lg" variant="light" color={direkt ? "teal" : "orange"}>{direkt ? "Direktauftrag" : "Ausschreibung nötig"}</Badge>
            {plan.needsDigitizing && <Badge size="lg" variant="light" color="grape">Digitalisierung (Punch)</Badge>}
          </Group>
        )}
      </Group>
      {plan && (
        <Group mt="sm" align="end" gap="sm" wrap="wrap">
          <Select label="Gewählte Stickerei (Partner der Firma)" placeholder="kein Partner" searchable clearable w={300}
            value={partnerId} data={suppliers.map((s) => ({ value: s.id, label: s.name }))} onChange={setPartnerId} />
          <Button variant="light" loading={savingPartner} onClick={() => void savePartner()}>Partner speichern</Button>
          {partnerMsg && <Text size="sm" c="teal">{partnerMsg}</Text>}
        </Group>
      )}
      {plan && (
        <Text size="xs" c="dimmed" mt={4}>
          Per Mail ausgeschrieben? Die beste Stickerei hier als Partner hinterlegen — bei vorhandener Stickdatei wird der Weg dann automatisch zum Direktauftrag.
        </Text>
      )}
      {err && <Text size="sm" c="red" mt="xs">{err}</Text>}
      {plan && <Text size="sm" mt="sm">{plan.reason}</Text>}
      {plan && !direkt && (
        <Text size="xs" c="dimmed" mt={4}>
          Nächster Schritt: Ausschreibung an die Stickerei-Partner (Stick-EK-Staffeln einholen &amp; vergleichen).
        </Text>
      )}
      {plan && direkt && (
        <Text size="xs" c="dimmed" mt={4}>
          Nächster Schritt: Direktauftrag — die Veredelung läuft als Fremdvergabe (T-04) an den hinterlegten Partner.
        </Text>
      )}
    </Card>
  );
}

// ── Ausschreibung (RfQ) je Logo (Kap. 5.4) ───────────────────────────────────────
// Mehrere Stickerei-Angebote (Stick-EK-Staffeln) erfassen, VK je Stufe vergleichen und
// den Gewinner wählen — übernimmt Lieferant als Firmen-Partner und die Staffeln ans Logo.
type AusschreibungDetail = Awaited<ReturnType<typeof trpc.stickerei.ausschreibung.get.query>>;
function StickereiAusschreibungen({ logos, onDecided }: { logos: LogoOption[]; onDecided: () => Promise<void> | void }): JSX.Element {
  const [logoVersionId, setLogoVersionId] = useState("");
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [list, setList] = useState<Awaited<ReturnType<typeof trpc.stickerei.ausschreibung.list.query>>>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AusschreibungDetail>(null);
  const [err, setErr] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [notiz, setNotiz] = useState("");
  const [staffeln, setStaffeln] = useState<{ minMenge: number | ""; euro: number | "" }[]>([{ minMenge: 1, euro: "" }]);

  useEffect(() => { void (async () => { try { setSuppliers((await trpc.suppliers.listAll.query()).map((s) => ({ id: s.id, name: s.name }))); } catch { /* leer */ } })(); }, []);
  const loadList = useCallback(async (id: string) => {
    if (!id) { setList([]); return; }
    try { setList(await trpc.stickerei.ausschreibung.list.query({ logoVersionId: id })); } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void loadList(logoVersionId); }, [logoVersionId, loadList]);
  const loadDetail = useCallback(async (id: string | null) => {
    if (!id) { setDetail(null); return; }
    try { setDetail(await trpc.stickerei.ausschreibung.get.query({ id })); } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void loadDetail(openId); }, [openId, loadDetail]);

  const create = async (): Promise<void> => {
    setErr(null);
    try { const { id } = await trpc.stickerei.ausschreibung.create.mutate({ logoVersionId }); await loadList(logoVersionId); setOpenId(id); }
    catch (e) { setErr(errMsg(e)); }
  };
  const addAngebot = async (): Promise<void> => {
    if (!openId || !supplierId) return;
    setErr(null);
    const rows = staffeln
      .filter((s) => s.minMenge !== "" && s.euro !== "")
      .map((s) => ({ minMenge: Number(s.minMenge), ekCents: Math.round(Number(s.euro) * 100) }));
    if (rows.length === 0) { setErr("Mindestens eine Staffel mit Menge und EK erfassen."); return; }
    try {
      await trpc.stickerei.ausschreibung.addAngebot.mutate({ ausschreibungId: openId, supplierId, notiz: notiz.trim() || undefined, staffeln: rows });
      setSupplierId(null); setNotiz(""); setStaffeln([{ minMenge: 1, euro: "" }]);
      await loadDetail(openId);
    } catch (e) { setErr(errMsg(e)); }
  };
  const decide = async (gewinnerAngebotId: string): Promise<void> => {
    if (!openId || (typeof window !== "undefined" && !window.confirm("Dieses Angebot als Gewinner wählen? Partner + Staffeln werden ans Logo übernommen."))) return;
    setErr(null);
    try { await trpc.stickerei.ausschreibung.decide.mutate({ ausschreibungId: openId, gewinnerAngebotId }); await loadDetail(openId); await loadList(logoVersionId); await onDecided(); }
    catch (e) { setErr(errMsg(e)); }
  };

  const entschieden = detail?.status !== "OFFEN";
  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Ausschreibung je Logo (Kap. 5.4)</Title>
      <Text size="sm" c="dimmed" mt={4}>Per Mail eingeholte Stickerei-Angebote erfassen, VK je Stufe vergleichen, Gewinner wählen — übernimmt Partner + Staffeln automatisch.</Text>
      <Group mt="sm" align="end" gap="md" wrap="wrap">
        <Select label="Logo" placeholder="Logo wählen…" searchable w={300} value={logoVersionId || null}
          data={logos.map((l) => ({ value: l.id, label: l.label }))} onChange={(v) => { setLogoVersionId(v ?? ""); setOpenId(null); }} />
        {logoVersionId && <Button variant="light" onClick={() => void create()}>Neue Ausschreibung</Button>}
      </Group>
      {list.length > 0 && (
        <Group mt="sm" gap="xs" wrap="wrap">
          {list.map((a) => (
            <Button key={a.id} size="compact-sm" variant={openId === a.id ? "filled" : "default"} onClick={() => setOpenId(a.id)}>
              {new Date(a.createdAt).toLocaleDateString("de-DE")} · {a.angebotCount} Angebote · {a.status === "OFFEN" ? "offen" : a.status === "ENTSCHIEDEN" ? "entschieden" : "abgebrochen"}
            </Button>
          ))}
        </Group>
      )}
      {err && <Text size="sm" c="red" mt="xs">{err}</Text>}
      {detail && (
        <>
          <Table mt="md" withTableBorder verticalSpacing="xs" fz="sm">
            <Table.Thead><Table.Tr>
              <Table.Th>Stickerei</Table.Th><Table.Th>Notiz</Table.Th><Table.Th>Staffeln (Menge → EK / VK)</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {detail.angebote.map((ang) => {
                const win = detail.gewinnerAngebotId === ang.id;
                return (
                  <Table.Tr key={ang.id} style={win ? { background: "var(--mantine-color-teal-0)" } : undefined}>
                    <Table.Td>{ang.supplierName ?? ang.supplierId}{win && <Badge ml="xs" size="sm" color="teal" variant="light">Gewinner</Badge>}</Table.Td>
                    <Table.Td>{ang.notiz ?? "—"}</Table.Td>
                    <Table.Td>{ang.staffeln.map((s) => `${s.minMenge}: ${euro(s.ekCents)} / ${euro(s.vkCents)}`).join("  ·  ")}</Table.Td>
                    <Table.Td>{!entschieden && <Button size="compact-xs" color="green" onClick={() => void decide(ang.id)}>Wählen</Button>}</Table.Td>
                  </Table.Tr>
                );
              })}
              {detail.angebote.length === 0 && <Table.Tr><Table.Td colSpan={4}><Text size="sm" c="dimmed">Noch keine Angebote erfasst.</Text></Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>
          {!entschieden && (
            <Card withBorder mt="sm" padding="sm" bg="gray.0">
              <Text size="sm" fw={600}>Angebot erfassen</Text>
              <Group mt="xs" align="end" gap="sm" wrap="wrap">
                <Select label="Stickerei" placeholder="Lieferant" searchable w={220} value={supplierId} data={suppliers.map((s) => ({ value: s.id, label: s.name }))} onChange={setSupplierId} />
                <TextInput label="Notiz (optional)" w={180} value={notiz} onChange={(e) => setNotiz(e.currentTarget.value)} />
              </Group>
              {staffeln.map((s, i) => (
                <Group key={i} mt="xs" gap="sm" align="end">
                  <NumberInput label={i === 0 ? "ab Menge" : undefined} w={120} min={1} value={s.minMenge} onChange={(v) => setStaffeln((rows) => rows.map((r, j) => j === i ? { ...r, minMenge: typeof v === "number" ? v : "" } : r))} />
                  <NumberInput label={i === 0 ? "Stick-EK je Stück (€)" : undefined} w={180} min={0} decimalScale={2} value={s.euro} onChange={(v) => setStaffeln((rows) => rows.map((r, j) => j === i ? { ...r, euro: typeof v === "number" ? v : "" } : r))} />
                  {staffeln.length > 1 && <Button size="compact-xs" variant="subtle" color="red" onClick={() => setStaffeln((rows) => rows.filter((_, j) => j !== i))}>entfernen</Button>}
                </Group>
              ))}
              <Group mt="xs" gap="sm">
                <Button size="compact-xs" variant="default" onClick={() => setStaffeln((rows) => [...rows, { minMenge: "", euro: "" }])}>+ Staffel</Button>
                <Button size="compact-sm" disabled={!supplierId} onClick={() => void addAngebot()}>Angebot hinzufügen</Button>
              </Group>
            </Card>
          )}
        </>
      )}
    </Card>
  );
}

// ── Logo-Verwaltung (Kap. 7.2): Versionen anlegen + aktiv setzen ─────────────────
// Logo-Versionen je Firma; genau eine ist aktiv. Beim Anlegen wird die Versionsnummer
// automatisch vergeben (vorherige aktive Version wird inaktiv); eine ältere Version
// kann wieder aktiv gesetzt werden.
function LogoVerwaltung({ logos, onChanged }: { logos: LogoOption[]; onChanged: () => Promise<void> | void }): JSX.Element {
  const [companies, setCompanies] = useState<{ value: string; label: string }[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [active, setActive] = useState(true);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const cs = await trpc.stickerei.companies.query();
        setCompanies(cs.map((c) => ({ value: c.id, label: c.name })));
        setCompanyId(cs[0]?.id ?? null);
      } catch (e) {
        setErr(errMsg(e));
      }
    })();
  }, []);

  const create = useCallback(async () => {
    setErr("");
    setStatus("");
    if (!companyId) {
      setErr("Bitte eine Firma wählen.");
      return;
    }
    if (!file) {
      setErr("Bitte eine Stickdatei wählen.");
      return;
    }
    try {
      const dataBase64 = await fileToBase64(file);
      const created = await trpc.stickerei.logos.create.mutate({
        companyId,
        file: { name: file.name, mimeType: file.type || "application/octet-stream", dataBase64 },
        active,
      });
      await onChanged();
      setStatus(`Angelegt: ${created.label} (${file.name}).`);
      setFile(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [companyId, file, active, onChanged]);

  const activate = useCallback(async (id: string) => {
    setErr("");
    setStatus("");
    try {
      await trpc.stickerei.logos.activate.mutate({ logoVersionId: id });
      await onChanged();
      setStatus("Aktive Version gesetzt.");
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [onChanged]);

  // Datei einer bestehenden Version ersetzen: verstecktes File-Input je Zeile auslösen.
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<string | null>(null);
  const onReplaceClick = (id: string) => {
    replaceTargetId.current = id;
    replaceInputRef.current?.click();
  };
  const onReplaceFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    const id = replaceTargetId.current;
    e.target.value = ""; // erlaubt erneutes Wählen derselben Datei
    if (!f || !id) return;
    setErr("");
    setStatus("");
    try {
      const dataBase64 = await fileToBase64(f);
      await trpc.stickerei.logos.replaceFile.mutate({
        logoVersionId: id,
        file: { name: f.name, mimeType: f.type || "application/octet-stream", dataBase64 },
      });
      await onChanged();
      setStatus(`Datei ersetzt: ${f.name}.`);
    } catch (err) {
      setErr(errMsg(err));
    }
  }, [onChanged]);

  const remove = useCallback(async (id: string, label: string) => {
    if (!window.confirm(`Logo-Version „${label}" wirklich löschen? Zugehörige Mengenstaffeln werden mitgelöscht.`)) return;
    setErr("");
    setStatus("");
    try {
      await trpc.stickerei.logos.delete.mutate({ logoVersionId: id });
      await onChanged();
      setStatus("Version gelöscht.");
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [onChanged]);

  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Logo-Verwaltung (Kap. 7.2)</Title>
      <Text size="sm" c="dimmed">
        Logo-Versionen je Firma — genau eine ist aktiv. Neue Version anlegen (Versionsnummer
        automatisch, setzt die vorherige inaktiv); eine ältere Version kann wieder aktiv gesetzt werden.
      </Text>

      <Table withTableBorder mt="sm" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Firma</Table.Th>
            <Table.Th ta="right">Version</Table.Th>
            <Table.Th>Stickdatei</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th ta="right">Aktionen</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {logos.map((l) => (
            <Table.Tr key={l.id}>
              <Table.Td>{l.companyName ?? l.id}</Table.Td>
              <Table.Td ta="right">v{l.version ?? "?"}</Table.Td>
              <Table.Td>
                {l.fileName
                  ? <Anchor href={`/logos/${l.id}/file`} target="_blank" rel="noreferrer" size="sm">{l.fileName}</Anchor>
                  : <Text size="sm" c="dimmed">—</Text>}
              </Table.Td>
              <Table.Td>
                {l.active
                  ? <Badge color="teal" variant="light">aktiv</Badge>
                  : <Button size="compact-xs" variant="default" onClick={() => void activate(l.id)}>Aktiv setzen</Button>}
              </Table.Td>
              <Table.Td ta="right">
                <Group gap={4} justify="flex-end" wrap="nowrap">
                  <Button size="compact-xs" variant="subtle" onClick={() => onReplaceClick(l.id)}>Ersetzen…</Button>
                  <Button size="compact-xs" variant="subtle" color="red" onClick={() => void remove(l.id, l.label)}>Löschen</Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {logos.length === 0 && (
            <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="dimmed">Noch keine Logos angelegt.</Text></Table.Td></Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <input ref={replaceInputRef} type="file" hidden onChange={(e) => void onReplaceFile(e)} />

      <Group align="end" gap="sm" mt="md">
        <Select label="Firma" w={220} searchable data={companies} value={companyId}
          onChange={setCompanyId} placeholder="Firma wählen…" />
        <FileInput label="Stickdatei (beliebiges Format)" w={260} clearable placeholder="Datei wählen…"
          value={file} onChange={setFile} />
        <Checkbox label="aktiv setzen" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} mb={6} />
        <Button onClick={() => void create()} disabled={!companyId || !file}>Version anlegen</Button>
      </Group>
      {status && <Text size="sm" c="dimmed" mt="xs">{status}</Text>}
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}
    </Card>
  );
}

const fmtFactor = (f: number): string =>
  `×${f.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FINISHING_OPTIONS = ["STICKEREI", "DRUCK", "TRANSFER"];

// ── Konfigurierbarer Aufschlagsfaktor (Kap. 4.4) ────────────────────────────────
// Globaler Standardfaktor, jederzeit änderbar; dazu Regeln je Parameter (Kundengruppe,
// Veredelungsart, Mengen- und EK-Wertbereich). Die spezifischste passende Regel gewinnt.
function MarkupConfigCard({ config, onSaved }: { config: MarkupConfig | null; onSaved: (c: MarkupConfig) => void }): JSX.Element {
  const [defaultFactor, setDefaultFactor] = useState(DEFAULT_MARKUP_CONFIG.defaultFactor);
  const [rules, setRules] = useState<MarkupRule[]>([]);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (config) {
      setDefaultFactor(config.defaultFactor);
      setRules(config.rules);
    }
  }, [config]);

  const setRule = (i: number, patch: Partial<MarkupRule>) =>
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRule = () => setRules((prev) => [...prev, { factor: defaultFactor }]);
  const removeRule = (i: number) => setRules((prev) => prev.filter((_, idx) => idx !== i));
  // Priorität = Reihenfolge: erste passende Regel gewinnt. Sortierbar per ▲▼ ODER Drag&Drop.
  const moveRuleTo = (from: number, to: number) =>
    setRules((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  const moveRule = (i: number, dir: -1 | 1) => moveRuleTo(i, i + dir);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const save = useCallback(async () => {
    setErr("");
    setStatus("");
    try {
      const res = (await trpc.stickerei.markup.saveConfig.mutate({ defaultFactor, rules })) as MarkupConfig;
      onSaved(res);
      setStatus(`Aufschlags-Konfiguration gespeichert (${res.rules.length} Regeln).`);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [defaultFactor, rules, onSaved]);

  // Optionale Felder: leeres Eingabefeld ⇒ Bedingung entfällt (undefined).
  const optInt = (v: number | string): number | undefined => (v === "" ? undefined : Math.max(1, Math.round(Number(v) || 1)));
  const euroToCents = (v: number | string): number | undefined => (v === "" ? undefined : Math.round((Number(v) || 0) * 100));

  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Aufschlagsfaktoren (Kap. 4.4)</Title>
      <Text size="sm" c="dimmed">
        Standardfaktor jederzeit änderbar; Regeln überschreiben ihn je Parameter
        (Kundengruppe · Veredelungsart · Mengen- und EK-Wertbereich). Geordnete Prioritätsliste:
        die erste passende Regel gewinnt (▲▼ zum Sortieren); ein Logo-Override (in der
        Staffel-Karte) schlägt alle Regeln.
      </Text>
      <Group align="end" gap="sm" mt="xs">
        <NumberInput label="Standardfaktor" w={140} hideControls min={0.01} step={0.01} decimalScale={2}
          value={defaultFactor} onChange={(v) => setDefaultFactor(Number(v) || 0)} />
        <Button onClick={() => void save()}>Speichern</Button>
      </Group>
      {status && <Text size="sm" c="dimmed" mt="xs">{status}</Text>}
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}

      <Table withTableBorder mt="sm" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th ta="center">Prio</Table.Th>
            <Table.Th ta="right">Faktor</Table.Th>
            <Table.Th>Kundengruppe</Table.Th>
            <Table.Th>Veredelung</Table.Th>
            <Table.Th ta="right">ab Menge</Table.Th>
            <Table.Th ta="right">bis Menge</Table.Th>
            <Table.Th ta="right">EK ab (€)</Table.Th>
            <Table.Th ta="right">EK bis (€)</Table.Th>
            <Table.Th>Bezeichnung</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rules.map((r, i) => (
            <Table.Tr key={i} bg={dragIdx === i ? "blue.0" : undefined}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragIdx !== null) moveRuleTo(dragIdx, i); setDragIdx(null); }}>
              <Table.Td>
                <Group gap={2} wrap="nowrap" justify="center">
                  <Text span style={{ cursor: "grab" }} c="dimmed" title="Ziehen zum Sortieren"
                    draggable onDragStart={() => setDragIdx(i)} onDragEnd={() => setDragIdx(null)}>⠿</Text>
                  <Text size="xs" c="dimmed" w={14} ta="right">{i + 1}</Text>
                  <Button size="compact-xs" px={4} variant="subtle" disabled={i === 0} onClick={() => moveRule(i, -1)}>▲</Button>
                  <Button size="compact-xs" px={4} variant="subtle" disabled={i === rules.length - 1} onClick={() => moveRule(i, 1)}>▼</Button>
                </Group>
              </Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={70} size="xs" hideControls min={0.01} step={0.01} decimalScale={2}
                  value={r.factor} onChange={(v) => setRule(i, { factor: Number(v) || 0 })} />
              </Table.Td>
              <Table.Td>
                <TextInput w={120} size="xs" placeholder="alle" value={r.priceGroupId ?? ""}
                  onChange={(e) => setRule(i, { priceGroupId: e.currentTarget.value || undefined })} />
              </Table.Td>
              <Table.Td>
                <Select w={120} size="xs" clearable placeholder="alle" data={FINISHING_OPTIONS}
                  value={r.finishingType ?? null}
                  onChange={(v) => setRule(i, { finishingType: (v as FinishingType) || undefined })} />
              </Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={70} size="xs" hideControls min={1} value={r.minMenge ?? ""}
                  onChange={(v) => setRule(i, { minMenge: optInt(v) })} />
              </Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={70} size="xs" hideControls min={1} value={r.maxMenge ?? ""}
                  onChange={(v) => setRule(i, { maxMenge: optInt(v) })} />
              </Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={80} size="xs" hideControls min={0} step={0.01} decimalScale={2}
                  value={r.minEkCents != null ? r.minEkCents / 100 : ""} onChange={(v) => setRule(i, { minEkCents: euroToCents(v) })} />
              </Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={80} size="xs" hideControls min={0} step={0.01} decimalScale={2}
                  value={r.maxEkCents != null ? r.maxEkCents / 100 : ""} onChange={(v) => setRule(i, { maxEkCents: euroToCents(v) })} />
              </Table.Td>
              <Table.Td>
                <TextInput w={140} size="xs" placeholder="optional" value={r.label ?? ""}
                  onChange={(e) => setRule(i, { label: e.currentTarget.value || undefined })} />
              </Table.Td>
              <Table.Td ta="right">
                <Button size="xs" variant="subtle" color="red" onClick={() => removeRule(i)}>✕</Button>
              </Table.Td>
            </Table.Tr>
          ))}
          {rules.length === 0 && (
            <Table.Tr><Table.Td colSpan={10}><Text size="sm" c="dimmed">Keine Regeln — überall gilt der Standardfaktor.</Text></Table.Td></Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <Button size="xs" variant="default" mt="sm" onClick={addRule}>+ Regel</Button>
    </Card>
  );
}

// ── Stickerei-Mengenstaffeln je Logo (Kap. 4.4 / T-15) ──────────────────────────
// Die Stickerei gibt uns nur ihren VK (= unseren Stick-EK) je Stück gestaffelt nach
// Menge; Staffelgrenzen frei wählbar und je Logo abweichend. EK wird manuell erfasst,
// unser VK = EK × Aufschlag (Standard/Regeln/Logo-Override) live berechnet — gleiche reine
// Logik wie der Server (@texma/shared).
interface StaffelRow {
  minMenge: number;
  ekEuro: number;
}
const DEFAULT_STAFFEL_ROWS: StaffelRow[] = [
  { minMenge: 1, ekEuro: 12.0 },
  { minMenge: 10, ekEuro: 9.5 },
  { minMenge: 25, ekEuro: 7.8 },
  { minMenge: 50, ekEuro: 6.4 },
  { minMenge: 100, ekEuro: 5.2 },
  { minMenge: 250, ekEuro: 4.3 },
];
const toStaffeln = (rows: ReadonlyArray<StaffelRow>): StickereiStaffel[] =>
  rows.map((r) => ({ minMenge: Math.round(r.minMenge), ekCents: Math.round(r.ekEuro * 100) }));

function StickereiStaffeln({ config, logos }: { config: MarkupConfig | null; logos: LogoOption[] }): JSX.Element {
  const [logoVersionId, setLogoVersionId] = useState("");
  const [rows, setRows] = useState<StaffelRow[]>(DEFAULT_STAFFEL_ROWS);
  const [logoOverride, setLogoOverride] = useState<number | null>(null);
  const [priceGroupId, setPriceGroupId] = useState<string | undefined>(undefined);
  const [menge, setMenge] = useState(75);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");

  // Aufschlags-Auflösung wie auf dem Server: Konfig + Kontext (Kundengruppe/Veredelung) +
  // Logo-Override. Je Stufe greifen Mengen-/EK-Regeln über den Stufen-Kontext.
  const cfg = config ?? DEFAULT_MARKUP_CONFIG;
  const markup: StaffelMarkup = { config: cfg, context: { priceGroupId, finishingType: "STICKEREI" }, logoOverride };
  let byMin = new Map<number, { vkCents: number; dbCents: number }>();
  let computeError = "";
  let price: ReturnType<typeof stickereiPriceForMenge> = null;
  try {
    const staffeln = toStaffeln(rows);
    byMin = new Map(computeStickereiStaffelVks(staffeln, markup).map((s) => [s.minMenge, s]));
    price = stickereiPriceForMenge(staffeln, menge, markup);
  } catch (e) {
    computeError = errMsg(e);
  }

  const setRow = (i: number, patch: Partial<StaffelRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((prev) => [...prev, { minMenge: (prev[prev.length - 1]?.minMenge ?? 0) + 50 || 1, ekEuro: 0 }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const load = useCallback(async (id: string) => {
    setErr("");
    setStatus("");
    try {
      const res = await trpc.stickerei.staffeln.list.query({ logoVersionId: id });
      setRows(res.staffeln.map((s) => ({ minMenge: s.minMenge, ekEuro: s.ekCents / 100 })));
      setLogoOverride(res.logoOverride);
      setPriceGroupId(res.priceGroupId);
      setStatus(`${res.staffeln.length} Staffeln geladen${res.priceGroupId ? ` (Kundengruppe ${res.priceGroupId})` : ""}.`);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);

  // Einmalig die erste verfügbare Logo-Version wählen und laden, sobald die Liste da ist.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || logos.length === 0) return;
    didInit.current = true;
    const initial = logos[0]!.id;
    setLogoVersionId(initial);
    void load(initial);
  }, [logos, load]);

  const save = useCallback(async () => {
    setErr("");
    setStatus("");
    try {
      const res = await trpc.stickerei.staffeln.save.mutate({ logoVersionId, staffeln: toStaffeln(rows), logoOverride });
      setStatus(`Gespeichert: ${res.staffeln.length} Staffeln für ${logoVersionId}.`);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [logoVersionId, rows, logoOverride]);

  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Stickerei-Mengenstaffeln je Logo (Kap. 4.4 / T-15)</Title>
      <Text size="sm" c="dimmed">
        Die Stickerei gibt nur ihren VK (= unser Stick-EK) je Stück gestaffelt nach Menge —
        Staffeln frei wählbar je Logo. Stick-EK manuell eintragen; unser VK je Stück (und DB) wird
        mit dem aufgelösten Aufschlagsfaktor automatisch berechnet.
      </Text>
      <Group align="end" gap="sm" mt="xs">
        <Select label="Logo" w={240} searchable nothingFoundMessage="kein Logo" placeholder="Logo wählen…"
          data={logos.map((l) => ({ value: l.id, label: l.label }))} value={logoVersionId || null}
          onChange={(v) => { if (v) { setLogoVersionId(v); void load(v); } }} />
        <NumberInput label="Logo-Override (×)" w={140} hideControls min={0} step={0.01} decimalScale={2}
          placeholder="aus" value={logoOverride ?? ""}
          onChange={(v) => setLogoOverride(v === "" ? null : Number(v) || 0)} />
        <Button variant="default" onClick={() => void load(logoVersionId)} disabled={!logoVersionId}>Neu laden</Button>
        <Button onClick={() => void save()} disabled={!logoVersionId || !!computeError}>Speichern</Button>
      </Group>
      {status && <Text size="sm" c="dimmed" mt="xs">{status}</Text>}
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}

      <Table withTableBorder mt="sm" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th ta="right">ab Menge</Table.Th>
            <Table.Th ta="right">Stick-EK je Stück (€)</Table.Th>
            <Table.Th ta="right">Faktor</Table.Th>
            <Table.Th ta="right">unser VK je Stück (€)</Table.Th>
            <Table.Th ta="right">DB je Stück</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => {
            const vk = byMin.get(Math.round(r.minMenge));
            let resolved: ReturnType<typeof resolveMarkupFactor> | null = null;
            try {
              resolved = resolveMarkupFactor(
                cfg,
                { priceGroupId, finishingType: "STICKEREI", menge: Math.round(r.minMenge), ekCents: Math.round(r.ekEuro * 100) },
                logoOverride
              );
            } catch {
              resolved = null;
            }
            return (
              <Table.Tr key={i}>
                <Table.Td style={numTd}>
                  <NumberInput w={90} size="xs" hideControls min={1} value={r.minMenge}
                    onChange={(v) => setRow(i, { minMenge: Math.max(1, Number(v) || 1) })} />
                </Table.Td>
                <Table.Td style={numTd}>
                  <NumberInput w={100} size="xs" hideControls min={0} step={0.01} decimalScale={2}
                    value={r.ekEuro} onChange={(v) => setRow(i, { ekEuro: Number(v) || 0 })} />
                </Table.Td>
                <Table.Td style={numTd}>
                  {resolved ? (
                    <Text span size="sm" c={resolved.source === "default" ? "dimmed" : "navy.9"}
                      title={resolved.source === "rule" ? `Regel${resolved.ruleLabel ? `: ${resolved.ruleLabel}` : ""}` : resolved.source}>
                      {fmtFactor(resolved.factor)}
                    </Text>
                  ) : "—"}
                </Table.Td>
                <Table.Td style={numTd}>{vk ? <b>{euro(vk.vkCents)}</b> : "—"}</Table.Td>
                <Table.Td style={numTd}>{vk ? euro(vk.dbCents) : "—"}</Table.Td>
                <Table.Td ta="right">
                  <Button size="xs" variant="subtle" color="red" onClick={() => removeRow(i)}>✕</Button>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Group mt="sm" justify="space-between">
        <Button size="xs" variant="default" onClick={addRow}>+ Staffel</Button>
        {computeError && <Text c="red" size="sm">Eingabe ungültig: {computeError}</Text>}
      </Group>

      <Group align="end" gap="sm" mt="md">
        <NumberInput label="Bestellmenge" w={130} hideControls min={0} value={menge}
          onChange={(v) => setMenge(Math.max(0, Number(v) || 0))} />
        <Text size="sm">
          {computeError ? "—" : price
            ? <>gültige Staffel: <b>ab {price.minMenge} Stk.</b> · EK {euro(price.ekCents)} · VK <b>{euro(price.vkCents)}</b> je Stück</>
            : "keine Staffel für diese Menge (unter der kleinsten Grenze)"}
        </Text>
      </Group>
    </Card>
  );
}

// ── Nachkalkulation Soll-Ist (T-10) ─────────────────────────────────────────────
interface PostcalcResult {
  plan: { revenueCents: number; materialCents: number; laborCents: number; dbCents: number };
  ist: { revenueCents: number; materialCents: number; laborCents: number; dbCents: number };
  dbVarianceCents: number;
  planMarginPct: number;
  istMarginPct: number;
  status: string;
  variance: {
    revenueVarianceCents: number;
    materialVarianceCents: number;
    laborQtyVarianceCents: number;
    laborRateVarianceCents: number;
  };
}

export function Postcalc(): JSX.Element {
  const [productionId, setProductionId] = useState("");
  const [revenueEuro, setRevenueEuro] = useState(1000);
  const [materialEuro, setMaterialEuro] = useState(400);
  const [laborMinutes, setLaborMinutes] = useState(120);
  const [planRate, setPlanRate] = useState(60); // Cent je Minute
  const [istRate, setIstRate] = useState(70);
  const [res, setRes] = useState<PostcalcResult | null>(null);
  const [err, setErr] = useState("");

  const compute = useCallback(async () => {
    setErr("");
    try {
      const out = await trpc.postcalc.compute.query({
        productionId,
        plan: {
          revenueCents: Math.round(revenueEuro * 100),
          materialCents: Math.round(materialEuro * 100),
          laborMinutes,
          laborRateCentsPerMinute: planRate,
        },
        istLaborRateCentsPerMinute: istRate,
      });
      setRes(out as PostcalcResult);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [productionId, revenueEuro, materialEuro, laborMinutes, planRate, istRate]);

  const statusC = statusMantineColor[res?.status ?? ""] ?? "gray";

  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Nachkalkulation Soll-Ist (T-10)</Title>
      <Text size="sm" c="dimmed">
        Plan-DB gegen Ist-DB, inkl. Abweichungszerlegung (Material · Lohn-Menge · Lohn-Satz).
      </Text>
      <Group align="end" gap="sm" mt="xs">
        <TextInput label="PA-ID" placeholder="z. B. cuid…" w={180}
          value={productionId} onChange={(e) => setProductionId(e.currentTarget.value)} />
        <NumberInput label="Umsatz (€)" w={110} hideControls value={revenueEuro} onChange={(v) => setRevenueEuro(Number(v) || 0)} />
        <NumberInput label="Material (€)" w={110} hideControls value={materialEuro} onChange={(v) => setMaterialEuro(Number(v) || 0)} />
        <NumberInput label="Lohn (Min)" w={100} hideControls value={laborMinutes} onChange={(v) => setLaborMinutes(Number(v) || 0)} />
        <NumberInput label="Plan-Satz (ct/Min)" w={130} hideControls value={planRate} onChange={(v) => setPlanRate(Number(v) || 0)} />
        <NumberInput label="Ist-Satz (ct/Min)" w={130} hideControls value={istRate} onChange={(v) => setIstRate(Number(v) || 0)} />
      </Group>
      <Button mt="sm" onClick={() => void compute()} disabled={!productionId}>Berechnen</Button>
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}
      {res && (
        <>
          <Group gap="lg" mt="sm">
            <Text size="sm">Plan-DB: <b>{euro(res.plan.dbCents)}</b> ({res.planMarginPct} %)</Text>
            <Text size="sm">Ist-DB: <b>{euro(res.ist.dbCents)}</b> ({res.istMarginPct} %)</Text>
            <Text size="sm">Abweichung: <Text span fw={700} c={statusC}>{res.dbVarianceCents >= 0 ? "+" : ""}{euro(res.dbVarianceCents)}</Text></Text>
            <Group gap={6}><Text size="sm">Status:</Text><StatusBadge s={res.status} /></Group>
          </Group>
          <Table withTableBorder mt="sm" verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr><Table.Th>Abweichungskomponente</Table.Th><Table.Th ta="right">Wirkung auf DB</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>Umsatz (Ist − Plan)</Table.Td><Table.Td style={numTd}>{euro(res.variance.revenueVarianceCents)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Material (Plan − Ist)</Table.Td><Table.Td style={numTd}>{euro(res.variance.materialVarianceCents)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Lohn-Menge (Zeit)</Table.Td><Table.Td style={numTd}>{euro(res.variance.laborQtyVarianceCents)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Lohn-Satz</Table.Td><Table.Td style={numTd}>{euro(res.variance.laborRateVarianceCents)}</Table.Td></Table.Tr>
            </Table.Tbody>
          </Table>
        </>
      )}
    </Card>
  );
}

// ── Mehrstufige Fremdvergabe — Plan + Klickpfad (T-04 / Kap. 5.3) ────────────────
type SubStatus = "OFFEN" | "BEISTELLUNG_VERSANDT" | "RUECKLAUF_ERHALTEN" | "ABGESCHLOSSEN";
interface Stage {
  id: string;
  sequence: number;
  supplierId: string;
  status: SubStatus;
  beistellMenge?: number | null;
  ruecklaufMenge?: number | null;
  dueDate?: string | null;
}
interface SubPlan {
  totalScrap: number;
  totalLohnCents: number;
  progressPercent: number;
  yieldPercent: number | null;
  allReturned: boolean;
}

const RETURNED = new Set<SubStatus>(["RUECKLAUF_ERHALTEN", "ABGESCHLOSSEN"]);
const STATUS_LABEL: Record<SubStatus, string> = {
  OFFEN: "offen",
  BEISTELLUNG_VERSANDT: "beigestellt",
  RUECKLAUF_ERHALTEN: "Rücklauf erhalten",
  ABGESCHLOSSEN: "abgeschlossen",
};
const isOverdue = (s: Stage): boolean =>
  !!s.dueDate && !RETURNED.has(s.status) && new Date(s.dueDate).getTime() < Date.now();

function SubproductionPlan({ role }: { role: string }): JSX.Element {
  const [productionId, setProductionId] = useState("");
  const [plan, setPlan] = useState<SubPlan | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [menge, setMenge] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const canAct = role === "ADMIN" || role === "BUERO";

  const load = useCallback(async () => {
    setErr("");
    try {
      const [p, s] = await Promise.all([
        trpc.subproduction.plan.query({ productionId }),
        trpc.subproduction.list.query({ productionId }),
      ]);
      setPlan(p as unknown as SubPlan);
      setStages((s as unknown as { stages: Stage[] }).stages);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [productionId]);

  const advance = useCallback(
    async (stage: Stage, to: SubStatus, withMenge: boolean) => {
      setErr("");
      setBusy(true);
      try {
        const raw = menge[stage.id];
        const m = withMenge && raw != null && raw !== "" ? Number(raw) : undefined;
        await trpc.subproduction.advance.mutate({
          subProductionId: stage.id,
          to: to as "BEISTELLUNG_VERSANDT" | "RUECKLAUF_ERHALTEN" | "ABGESCHLOSSEN",
          ...(m != null ? { menge: m } : {}),
        });
        await load();
      } catch (e) {
        setErr(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [menge, load]
  );

  // Client-Gate (zusätzlich zur Server-Prüfung, T-04): eine OFFENE Stufe ist erst startbar,
  // wenn alle vorherigen Stufen zurück sind.
  const canStart = (i: number): boolean => stages.slice(0, i).every((s) => RETURNED.has(s.status));

  const mengeBox = (s: Stage, ph: string): JSX.Element => (
    <NumberInput w={72} size="xs" hideControls min={0} placeholder={ph}
      value={menge[s.id] ?? ""} onChange={(v) => setMenge((m) => ({ ...m, [s.id]: v === "" ? "" : String(v) }))} />
  );

  const action = (s: Stage, i: number): JSX.Element => {
    if (s.status === "ABGESCHLOSSEN") return <Badge color="green" variant="light">✓ abgeschlossen</Badge>;
    if (!canAct) return <Text c="dimmed">—</Text>;
    if (s.status === "OFFEN") {
      return canStart(i) ? (
        <Group gap="xs" wrap="nowrap">
          {mengeBox(s, "Menge")}
          <Button size="xs" disabled={busy} onClick={() => void advance(s, "BEISTELLUNG_VERSANDT", true)}>Beistellung versenden</Button>
        </Group>
      ) : <Text c="dimmed">blockiert</Text>;
    }
    if (s.status === "BEISTELLUNG_VERSANDT") {
      return (
        <Group gap="xs" wrap="nowrap">
          {mengeBox(s, "Rückl.")}
          <Button size="xs" disabled={busy} onClick={() => void advance(s, "RUECKLAUF_ERHALTEN", true)}>Rücklauf erfassen</Button>
        </Group>
      );
    }
    return <Button size="xs" variant="default" disabled={busy} onClick={() => void advance(s, "ABGESCHLOSSEN", false)}>Abschließen</Button>;
  };

  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Mehrstufige Fremdvergabe — Plan + Aktionen (T-04, Kap. 5.3)</Title>
      <Text size="sm" c="dimmed">
        Stufen sequenziell weiterschalten: Beistellung → Rücklauf → Abschluss (mit Mengenfluss/Schwund).
      </Text>
      <Group align="end" gap="sm" mt="xs">
        <TextInput label="PA-ID" placeholder="Produktions-Auftrag-ID" w={220}
          value={productionId} onChange={(e) => setProductionId(e.currentTarget.value)} />
        <Button onClick={() => void load()} disabled={!productionId}>Plan laden</Button>
      </Group>
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}
      {plan && (
        <Group gap="lg" mt="sm">
          <Text size="sm">Fortschritt: <b>{plan.progressPercent} %</b></Text>
          <Text size="sm">Ausbeute: <b>{plan.yieldPercent == null ? "—" : `${plan.yieldPercent} %`}</b></Text>
          <Text size="sm">Schwund: <b>{plan.totalScrap}</b></Text>
          <Text size="sm">Lohn gesamt: <b>{euro(plan.totalLohnCents)}</b></Text>
          <Text size="sm" c={plan.allReturned ? "green" : "dimmed"}>{plan.allReturned ? "✓ alle zurück" : "offen"}</Text>
        </Group>
      )}
      {stages.length > 0 && (
        <Table withTableBorder mt="sm" verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Stufe</Table.Th>
              <Table.Th>Veredler</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th ta="right">Menge B/R</Table.Th>
              <Table.Th>Aktion</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {stages.map((s, i) => (
              <Table.Tr key={s.id}>
                <Table.Td>#{s.sequence}</Table.Td>
                <Table.Td>{s.supplierId}</Table.Td>
                <Table.Td>
                  <Group gap={6}>
                    <Text size="sm">{STATUS_LABEL[s.status]}</Text>
                    {isOverdue(s) && <Badge color="red" variant="light" size="sm">überfällig</Badge>}
                  </Group>
                </Table.Td>
                <Table.Td style={numTd}>{s.beistellMenge ?? "—"}{s.ruecklaufMenge != null ? ` / ${s.ruecklaufMenge}` : ""}</Table.Td>
                <Table.Td>{action(s, i)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {!canAct && stages.length > 0 && (
        <Text size="sm" c="dimmed" mt="xs">Aktionen erfordern Rolle ADMIN/BÜRO (Kap. 12).</Text>
      )}
    </Card>
  );
}
