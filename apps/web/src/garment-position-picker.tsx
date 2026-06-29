// Interaktiver SVG-/Bild-Positions-Picker für Veredelungen (T-04): Kleidungstyp
// (Shirt/Cap/Hose) + Ansicht wählen, Markerpunkt per Klick setzen. Liefert
// positionType/positionSide/positionId + das deutsche Label zurück — die Auswahl
// hat im Werkstattblatt Vorrang vor der Text-Heuristik (resolveGarmentPlacement).
// Bilder + Koordinaten kommen aus @texma/shared (eine Quelle mit dem PDF-Renderer).

import { useEffect, useState } from "react";
import { Badge, Box, Button, Group, Modal, SegmentedControl, Stack, Text, Tooltip } from "@mantine/core";
import { POSITION_POINTS, type GarmentType } from "@texma/shared/veredelungsauftrag";
import {
  CAP_FRONT_B64,
  CAP_HINTEN_B64,
  CAP_LINKS_B64,
  CAP_RECHTS_B64,
  HOSE_FRONT_B64,
  SHIRT_BACK_B64,
  SHIRT_FRONT_B64,
} from "@texma/shared/garment-assets";
import { T } from "./theme.js";

export interface GarmentSelection {
  positionType: GarmentType;
  positionSide: string;
  positionId: string;
  /** Deutsches Label des Markerpunkts (z. B. „Brust links") — füllt die Platzierung. */
  label: string;
}

const TYPE_LABELS: Record<GarmentType, string> = { shirt: "Shirt / Sweater", cap: "Cap / Mütze", hose: "Hose" };
const SIDE_LABELS: Record<string, string> = { front: "Vorne", back: "Hinten", links: "Links", rechts: "Rechts", hinten: "Hinten" };

function imgSrc(type: GarmentType, side: string): string {
  if (type === "shirt") return `data:image/jpeg;base64,${side === "back" ? SHIRT_BACK_B64 : SHIRT_FRONT_B64}`;
  if (type === "hose") return `data:image/png;base64,${HOSE_FRONT_B64}`;
  const m: Record<string, string> = { front: CAP_FRONT_B64, links: CAP_LINKS_B64, rechts: CAP_RECHTS_B64, hinten: CAP_HINTEN_B64 };
  return `data:image/png;base64,${m[side] ?? CAP_FRONT_B64}`;
}

const sidesOf = (t: GarmentType): string[] => Object.keys(POSITION_POINTS[t]);
const pointsOf = (t: GarmentType, side: string) => POSITION_POINTS[t][side] ?? POSITION_POINTS[t][sidesOf(t)[0]!] ?? [];
const labelOf = (t: GarmentType, side: string, id: string): string => pointsOf(t, side).find((p) => p.id === id)?.label ?? "";

/** Reine Bild-Hotspot-Auswahl (ohne Modal): Bild + klickbare Punkte für eine Ansicht. */
function PickerCanvas({ type, side, selectedId, onPick }: { type: GarmentType; side: string; selectedId: string; onPick: (id: string) => void }): JSX.Element {
  const W = 230;
  return (
    <Box pos="relative" w={W} mx="auto" style={{ lineHeight: 0 }}>
      <img src={imgSrc(type, side)} alt={`${TYPE_LABELS[type]} ${SIDE_LABELS[side] ?? side}`} width={W} style={{ display: "block", width: W, height: "auto", userSelect: "none" }} draggable={false} />
      {pointsOf(type, side).map((p) => {
        const sel = p.id === selectedId;
        return (
          <Tooltip key={p.id} label={p.label} withArrow position="top" openDelay={150}>
            <button
              type="button"
              aria-label={p.label}
              aria-pressed={sel}
              onClick={() => onPick(p.id)}
              style={{
                position: "absolute",
                left: `${p.xPct * 100}%`,
                top: `${p.yPct * 100}%`,
                transform: "translate(-50%, -50%)",
                width: sel ? 20 : 15,
                height: sel ? 20 : 15,
                borderRadius: "50%",
                border: `2px solid ${sel ? T.success : T.primary}`,
                background: sel ? T.highlight : "rgba(255,255,255,0.82)",
                boxShadow: sel ? `0 0 0 3px rgba(52,255,103,0.25)` : "none",
                cursor: "pointer",
                padding: 0,
                transition: "width .08s, height .08s",
              }}
            />
          </Tooltip>
        );
      })}
    </Box>
  );
}

/**
 * Modal-Wrapper: Typ- und Ansichts-Tabs + Bild-Hotspots. „Übernehmen" liefert die
 * Auswahl (positionType/Side/Id + Label) an den Aufrufer; „Entfernen" löscht sie.
 */
export function GarmentPositionModal({
  opened,
  onClose,
  value,
  onSelect,
  onClear,
}: {
  opened: boolean;
  onClose: () => void;
  value?: { positionType?: string; positionSide?: string; positionId?: string };
  onSelect: (sel: GarmentSelection) => void;
  onClear?: () => void;
}): JSX.Element {
  const [type, setType] = useState<GarmentType>("shirt");
  const [side, setSide] = useState<string>("front");
  const [selId, setSelId] = useState<string>("");

  // Beim Öffnen aus dem aktuellen Wert vorbelegen (oder Default Shirt/vorne).
  useEffect(() => {
    if (!opened) return;
    const t = (value?.positionType as GarmentType) || "shirt";
    const s = value?.positionSide && POSITION_POINTS[t]?.[value.positionSide] ? value.positionSide : sidesOf(t)[0]!;
    setType(t);
    setSide(s);
    setSelId(value?.positionId ?? "");
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeType = (t: GarmentType): void => { setType(t); setSide(sidesOf(t)[0]!); setSelId(""); };
  const changeSide = (s: string): void => { setSide(s); if (!pointsOf(type, s).some((p) => p.id === selId)) setSelId(""); };

  const selLabel = selId ? labelOf(type, side, selId) : "";

  return (
    <Modal opened={opened} onClose={onClose} title="Veredelungsposition (Skizze)" size="auto" centered>
      <Stack gap="sm">
        <SegmentedControl
          size="xs"
          value={type}
          onChange={(v) => changeType(v as GarmentType)}
          data={(Object.keys(POSITION_POINTS) as GarmentType[]).map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
        />
        {sidesOf(type).length > 1 && (
          <SegmentedControl
            size="xs"
            value={side}
            onChange={changeSide}
            data={sidesOf(type).map((s) => ({ value: s, label: SIDE_LABELS[s] ?? s }))}
          />
        )}
        <PickerCanvas type={type} side={side} selectedId={selId} onPick={setSelId} />
        <Group justify="space-between" align="center">
          <Text size="sm">
            {selLabel
              ? <>Gewählt: <Badge color="grape" variant="light">{selLabel}</Badge></>
              : <Text span c="dimmed" size="sm">Punkt auf der Skizze anklicken …</Text>}
          </Text>
          <Group gap="xs">
            {onClear && (
              <Button size="xs" variant="subtle" color="gray" onClick={() => { onClear(); onClose(); }}>Entfernen</Button>
            )}
            <Button size="xs" variant="default" onClick={onClose}>Abbrechen</Button>
            <Button size="xs" disabled={!selId} onClick={() => { onSelect({ positionType: type, positionSide: side, positionId: selId, label: selLabel }); onClose(); }}>Übernehmen</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
