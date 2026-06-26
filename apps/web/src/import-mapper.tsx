// Generisches Import-Mapper-Modul (Stammdaten-Import, Xentral-„Import-Vorlagen"): CSV/Excel
// hochladen → Kopfzeile erkennen → Spalten den ERP-Zielfeldern zuordnen (automatisch, sonst
// manuell) → Live-Vorschau → Import. Die Zuordnung/CSV-Bildung ist rein (@texma/shared);
// der eigentliche Import läuft über die bestehenden, validierten Services (dataIo/matrixImport).

import { useCallback, useMemo, useState } from "react";
import { Alert, Badge, Box, Button, Card, Group, SegmentedControl, Select, Table, Text, TextInput, Title } from "@mantine/core";
import * as XLSX from "xlsx";
import {
  IMPORT_TARGETS, importTargetById, autoMapColumns, applyMapping,
  type ColumnMapping, type FieldSource, type ImportTargetId,
} from "@texma/shared/import-mapping";
import { trpc } from "./trpc.js";
import { DocListHeader } from "./doc-layout.js";
import { SupplierPicker } from "./pages.js";

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface Parsed { fileName: string; headers: string[]; rows: string[][]; }

// Quelle einer Zuordnung als String für das <Select> kodieren/dekodieren.
const COL_PREFIX = "col:";
const FIXED = "__fixed__";
const NONE = "__none__";
function srcToValue(src: FieldSource | undefined): string {
  if (!src || src.kind === "none") return NONE;
  if (src.kind === "fixed") return FIXED;
  return `${COL_PREFIX}${src.index}`;
}

export function ImportMapperPage(): JSX.Element {
  const [targetId, setTargetId] = useState<ImportTargetId>("ARTICLE");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [ekSupplier, setEkSupplier] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const target = importTargetById(targetId);

  const onFile = useCallback(async (file: File): Promise<void> => {
    setErr(null); setSummary(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]!];
      if (!ws) throw new Error("Keine Tabelle in der Datei gefunden.");
      const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "", blankrows: false });
      if (grid.length === 0) throw new Error("Die Datei ist leer.");
      const headers = (grid[0] ?? []).map((h) => String(h).trim());
      const rows = grid.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? "")));
      const p: Parsed = { fileName: file.name, headers, rows };
      setParsed(p);
      setMapping(autoMapColumns(headers, target.fields));
    } catch (e) { setErr(errMsg(e)); setParsed(null); }
  }, [target]);

  // Zielwechsel: Auto-Zuordnung gegen die schon geladene Datei neu rechnen.
  const changeTarget = (id: ImportTargetId): void => {
    setTargetId(id); setSummary(null);
    if (parsed) setMapping(autoMapColumns(parsed.headers, importTargetById(id).fields));
  };

  const setFieldSource = (key: string, value: string): void => {
    setMapping((m) => {
      const next: FieldSource =
        value === NONE ? { kind: "none" }
        : value === FIXED ? { kind: "fixed", value: (m[key]?.kind === "fixed" ? m[key]!.value : "") }
        : { kind: "column", index: Number(value.slice(COL_PREFIX.length)) };
      return { ...m, [key]: next };
    });
  };
  const setFixedValue = (key: string, value: string): void => setMapping((m) => ({ ...m, [key]: { kind: "fixed", value } }));

  const result = useMemo(() => (parsed ? applyMapping(target, parsed.rows, mapping) : null), [parsed, target, mapping]);

  const doImport = async (): Promise<void> => {
    if (!result) return;
    setErr(null); setBusy(true); setSummary(null);
    try {
      if (target.endpoint === "matrix") {
        const r = await trpc.matrixImport.run.mutate({ csv: result.csv, ...(ekSupplier ? { ekSupplierId: ekSupplier } : {}) });
        setSummary(`${r.articlesCreated} Artikel · ${r.variantsCreated} Varianten angelegt · ${r.variantsSkipped} übersprungen${r.ekLinked ? ` · ${r.ekLinked}× EK` : ""}${r.errors.length ? ` · ${r.errors.length} Fehler` : ""}.`);
      } else {
        const r = await trpc.dataIo.importCsv.mutate({ kind: target.kind!, csv: result.csv });
        setSummary(`${r.created} neu · ${r.updated} aktualisiert · ${r.skipped} übersprungen${r.errors.length ? ` · ${r.errors.length} Fehler` : ""}.`);
      }
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const colData = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [{ value: NONE, label: "— nicht zuordnen" }, { value: FIXED, label: "▸ Fester Wert" }];
    parsed?.headers.forEach((h, i) => opts.push({ value: `${COL_PREFIX}${i}`, label: `${String.fromCharCode(65 + (i % 26))} · ${h || `Spalte ${i + 1}`}` }));
    return opts;
  }, [parsed]);

  const sourceColor = (src: FieldSource | undefined): string => (!src || src.kind === "none" ? "gray" : src.kind === "fixed" ? "orange" : "green");

  return (
    <Box>
      <DocListHeader module="Werkzeuge / Import" title="Import-Mapper" hint="Stammdaten aus CSV oder Excel importieren: Datei hochladen, oberste Zeile als Überschriften erkennen, Spalten den ERP-Zielfeldern zuordnen (automatisch erkannt, manuell korrigierbar), Live-Vorschau, dann übernehmen." />

      <Card withBorder padding="md" mt="md">
        <Group justify="space-between" align="end" wrap="wrap">
          <Box>
            <Text size="sm" fw={600} mb={4}>1 · Welche Stammdaten?</Text>
            <SegmentedControl value={targetId} onChange={(v) => changeTarget(v as ImportTargetId)}
              data={IMPORT_TARGETS.map((t) => ({ value: t.id, label: t.label }))} />
          </Box>
          <Box>
            <Text size="sm" fw={600} mb={4}>2 · Datei (CSV oder Excel)</Text>
            <input type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={(e) => {
              const f = e.currentTarget.files?.[0]; if (f) void onFile(f);
            }} />
          </Box>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">Bestehende Datensätze werden über den natürlichen Schlüssel (z. B. Artikelnummer / Firmenname) aktualisiert, neue angelegt — kein stilles Überschreiben.</Text>
      </Card>

      {err && <Alert color="red" mt="md">{err}</Alert>}

      {parsed && result && (
        <>
          <Card withBorder padding="md" mt="md">
            <Group justify="space-between" mb="xs">
              <Title order={5}>3 · Felder zuordnen</Title>
              <Group gap="xs">
                <Badge color="gray" variant="dot">kein Wert</Badge>
                <Badge color="green" variant="dot">aus Datei</Badge>
                <Badge color="orange" variant="dot">fester Wert</Badge>
                <Text size="xs" c="dimmed">{parsed.fileName} · {parsed.rows.length} Zeilen · {result.mappedCount}/{target.fields.length} zugeordnet</Text>
              </Group>
            </Group>
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr><Table.Th w={240}>Zielfeld</Table.Th><Table.Th w={260}>Wert entnehmen aus…</Table.Th><Table.Th>Vorschau (erste Zeile)</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {target.fields.map((f) => {
                  const src = mapping[f.key];
                  const sample = result.records[0]?.[f.key] ?? "";
                  return (
                    <Table.Tr key={f.key}>
                      <Table.Td>
                        <Group gap={6}>
                          <Badge size="xs" variant="dot" color={sourceColor(src)}> </Badge>
                          <Text size="sm">{f.label}</Text>
                          {f.required && <Badge size="xs" color="red" variant="light">Pflicht</Badge>}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Select size="xs" w={src?.kind === "fixed" ? 130 : 240} data={colData} value={srcToValue(src)} onChange={(v) => v && setFieldSource(f.key, v)} />
                          {src?.kind === "fixed" && <TextInput size="xs" w={120} placeholder="Wert" value={src.value} onChange={(e) => setFixedValue(f.key, e.currentTarget.value)} />}
                        </Group>
                      </Table.Td>
                      <Table.Td><Text size="xs" c="dimmed" truncate>{sample}</Text></Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>

          <Card withBorder padding="md" mt="md">
            <Title order={5} mb="xs">4 · Live-Vorschau</Title>
            <Box style={{ overflowX: "auto", maxHeight: 300 }}>
              <Table withTableBorder stickyHeader>
                <Table.Thead>
                  <Table.Tr>{target.fields.map((f) => <Table.Th key={f.key}><Text size="xs">{f.label}</Text></Table.Th>)}</Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {result.records.slice(0, 12).map((rec, i) => (
                    <Table.Tr key={i}>{target.fields.map((f) => <Table.Td key={f.key}><Text size="xs">{rec[f.key]}</Text></Table.Td>)}</Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
            {result.records.length > 12 && <Text size="xs" c="dimmed" mt={4}>… {result.records.length - 12} weitere Zeilen</Text>}

            {result.missingRequired.length > 0 && (
              <Alert color="yellow" mt="md" title="Pflichtfelder fehlen">Bitte zuordnen: {result.missingRequired.join(", ")}</Alert>
            )}
            {target.endpoint === "matrix" && (
              <Group align="end" gap="xs" mt="md">
                <SupplierPicker label="EK + Lieferant verknüpfen (optional)" value={ekSupplier} onChange={setEkSupplier} w={260} />
                {ekSupplier && <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setEkSupplier("")}>abwählen</Button>}
              </Group>
            )}
            <Button mt="md" color="navy" disabled={busy || result.missingRequired.length > 0 || result.records.length === 0} loading={busy} onClick={() => void doImport()}>
              {result.records.length} Zeilen importieren
            </Button>
            {summary && <Alert color="green" mt="md" title="Import-Ergebnis">{summary}</Alert>}
          </Card>
        </>
      )}
    </Box>
  );
}
