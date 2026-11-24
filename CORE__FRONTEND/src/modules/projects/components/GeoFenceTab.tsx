import { useMemo, useState } from "react";
import { GeoMap, type GeoMapZone } from "./GeoMap";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { KV, MiniTable, Muted, Note } from "@/shared/ui/Extras";
import { FormGroup, Input, Select, Textarea } from "@/shared/ui/Field";
import { isRemote } from "@/modules/core-data";
import { ApiError, errorText, idempotencyKey } from "@/shared/lib/api";
import type { GeoShape, GeoZone, GeoZoneType, LatLng, Project } from "@/modules/core-data";
import { a11y } from "@/shared/lib/core";
import { fmtDateTime } from "@/shared/lib/format";
import {
  centroid,
  corridorAreaM2,
  fmtArea,
  fmtCoord,
  fmtDistance,
  lineLengthM,
  parsePoints,
  perimeterM,
  polygonAreaM2,
  selfIntersects,
  SHAPE_LABEL,
} from "../utils/geo";
import { requireStepUp } from "@/shared/lib/stepUp";
import { notify } from "@/shared/lib/toast";
import { Can, MANAGE, useCanManage } from '@/modules/auth';
import { useCore, zonesOf } from "@/modules/core-data";

interface Draft {
  shape: GeoShape;
  center: LatLng | null;
  radiusM: number;
  points: LatLng[];
  bufferM: number;
}

const MIN_R = 50;
const MAX_R = 5000;
const MIN_B = 5;
const MAX_B = 1000;
const MAX_PINS = 60;
/** pins mean a boundary (Polygon) or a centre line (Linear) */
const isPinned = (s: GeoShape) => s !== "Radius";

/** Problems that stop a fence from being saved. */
function problems(d: Draft): string[] {
  if (d.shape === "Radius") {
    const out: string[] = [];
    if (!d.center) out.push("Click the map or enter the centre point.");
    if (!(d.radiusM >= MIN_R && d.radiusM <= MAX_R))
      out.push(
        `Radius must be ${MIN_R} to ${MAX_R.toLocaleString("en-IN")} m.`,
      );
    return out;
  }
  if (d.shape === "Linear") {
    const out: string[] = [];
    if (d.points.length < 2)
      out.push(
        `Drop at least 2 pins along the centre line (${d.points.length} so far).`,
      );
    if (d.points.length > MAX_PINS) out.push(`Use at most ${MAX_PINS} pins.`);
    if (!(d.bufferM >= MIN_B && d.bufferM <= MAX_B))
      out.push(
        `Corridor width must be ${MIN_B} to ${MAX_B.toLocaleString("en-IN")} m each side.`,
      );
    if (d.points.length >= 2 && lineLengthM(d.points) < 20)
      out.push("The line is under 20 m. Spread the pins out.");
    return out;
  }
  if (d.points.length < 3)
    return [`Drop at least 3 pins (${d.points.length} so far).`];
  if (d.points.length > MAX_PINS) return [`Use at most ${MAX_PINS} pins.`];
  if (selfIntersects(d.points))
    return [
      "The boundary crosses itself. Drag or remove pins so the edges do not cross.",
    ];
  if (polygonAreaM2(d.points) < 100)
    return ["The area is under 100 m². Spread the pins out."];
  return [];
}

const areaOf = (d: Draft) =>
  d.shape === "Radius"
    ? Math.PI * d.radiusM ** 2
    : d.shape === "Linear"
      ? corridorAreaM2(d.points, d.bufferM)
      : polygonAreaM2(d.points);
const lengthOf = (d: Draft) =>
  d.shape === "Radius"
    ? 2 * Math.PI * d.radiusM
    : d.shape === "Linear"
      ? lineLengthM(d.points)
      : perimeterM(d.points);
const HINT: Record<GeoShape, string> = {
  Polygon:
    "Click the map to drop pins in order around the boundary. Drag a pin to move it; right-click to remove it.",
  Radius:
    "Click the map to place the centre, then set the radius. Drag the centre to move it.",
  Linear:
    "Click the map to drop pins along the centre line of the road, canal or pipeline, then set the corridor width. Drag a pin to move it; right-click to remove it.",
};

/** Geo-fence: saved fence on a map first; Edit opens the drawing tools. Saving needs step-up (PRD §4). */
export function GeoFenceTab({
  project,
  editing,
  onEdit,
  onDone,
  initialZoneId,
  startAdding,
}: {
  project: Project;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  /** the zone to open first (the Geofences page picks one) */
  initialZoneId?: string;
  /** open straight into drawing a new zone */
  startAdding?: boolean;
}) {
  const [zoneId, setZoneId] = useState<string | null>(initialZoneId ?? null);
  const [adding, setAdding] = useState(!!startAdding);
  // the drawing tools open only for a user who holds the privilege (the URL can ask for them)
  const canEdit = useCanManage(MANAGE.projects);
  const editMode = editing && canEdit;
  const zones = useCore((s) => zonesOf(s.projects, project.id));
  const g: GeoZone | undefined = adding
    ? undefined
    : (zones.find((z) => z.id === zoneId) ?? zones[0]);
  // with no fence yet, open the map near a fence of another project
  const nz = useCore(
    (s) => s.projects.find((p) => p.id !== project.id && p.zones.length)?.zones[0],
  );
  const fallback: LatLng | undefined = nz
    ? [nz.centerLat, nz.centerLng]
    : undefined;
  const saved: Draft = g
    ? {
        shape: g.shape,
        center: [g.centerLat, g.centerLng],
        radiusM: g.radiusM || 500,
        points: g.points,
        bufferM: g.bufferM || 100,
      }
    : {
        shape: "Polygon",
        center: null,
        radiusM: 500,
        points: [],
        bufferM: 100,
      };
  const done = () => {
    setAdding(false);
    onDone();
  };
  if (!editMode)
    return (
      <GeoView
        project={project}
        zone={g}
        draft={saved}
        onSelect={setZoneId}
        onAdd={() => {
          setAdding(true);
          onEdit();
        }}
        onEdit={onEdit}
        onEditZone={(id) => {
          // pick this zone, then open the drawing tools on it
          setZoneId(id);
          setAdding(false);
          onEdit();
        }}
        fallback={fallback}
      />
    );
  return (
    <GeoEdit
      project={project}
      zone={g}
      start={saved}
      onDone={done}
      fallback={fallback}
    />
  );
}

function GeoView({
  project,
  zone: g,
  draft,
  onSelect,
  onAdd,
  onEdit,
  onEditZone,
  fallback,
}: {
  project: Project;
  zone?: GeoZone;
  draft: Draft;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: () => void;
  onEditZone: (id: string) => void;
  fallback?: LatLng;
}) {
  const removeZone = useCore((s) => s.removeZone);
  const zones = useCore((s) => zonesOf(s.projects, project.id));
  // every other fence of the project is drawn on the same map; clicking one on the map selects it
  const others = useMemo<GeoMapZone[]>(
    () =>
      zones
        .filter((z) => z.id !== g?.id)
        .map((z) => ({ id: z.id, label: z.label, shape: z.shape, center: [z.centerLat, z.centerLng] as LatLng, radiusM: z.radiusM, points: z.points, bufferM: z.bufferM })),
    [zones, g?.id],
  );
  const remove = async () => {
    if (!g) return;
    if (!window.confirm(`Delete the zone "${g.label}"? Attendance will no longer be accepted inside it.`)) return;
    if (!(await requireStepUp(`Delete geo-fence zone ${g.label} of ${project.code}`, { allowPassword: true })))
      return notify("Zone not deleted: verification cancelled");
    try {
      await removeZone(project.id, g.id);
      notify(`Zone "${g.label}" deleted`);
    } catch (err) {
      notify(`Zone not deleted: ${errorText(err)}`, 6000);
    }
  };
  return (
    <div className="stack">
      <Card
        title="Geo-fence map"
        subtitle={
          g
            ? `${g.label} · ${SHAPE_LABEL[g.shape]} · version ${g.version}`
            : "No geo-fence saved yet"
        }
        action={
          <div className="row-actions">
            <Can privilege={MANAGE.projects}>
              {g && (
                <Button size="sm" icon="pencil" onClick={onEdit}>
                  Edit zone
                </Button>
              )}
              <Button size="sm" icon="plus" onClick={onAdd}>
                Add zone
              </Button>
            </Can>
          </div>
        }
      >
        <GeoMap
          label={`Geo-fence of ${project.name}`}
          shape={draft.shape}
          center={draft.center}
          radiusM={draft.radiusM}
          points={draft.points}
          bufferM={draft.bufferM}
          others={others}
          onOtherSelect={onSelect}
          fitKey={`view-${zones.length}`}
          fallback={fallback}
        />
        {zones.length > 1 && (
          <Muted>
            All {zones.length} zones of this project are shown. Click a zone on the map, or pick one in the list below,
            to select it; then choose Edit zone.
          </Muted>
        )}
        {!g && (
          <Note title="Attendance needs a geo-fence" icon="mapPinOff">
            HRMS marks attendance only inside the project geo-fence. Draw one to
            switch it on for this project.
          </Note>
        )}
      </Card>
      <Card
        title="Fence details"
        subtitle="Attendance is accepted inside any zone of this project."
        action={
          g && (
            <Can privilege={MANAGE.projects}>
              <Button size="sm" icon="trash" onClick={remove}>
                Delete zone
              </Button>
            </Can>
          )
        }
      >
        {zones.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <MiniTable
              head={["Zone", "Type", "Shape", "Version", ""]}
              rows={zones.map((z) => [
                <button
                  key="l"
                  type="button"
                  className="link-btn"
                  aria-current={g?.id === z.id}
                  onClick={() => onSelect(z.id)}
                  style={{ fontWeight: g?.id === z.id ? 700 : 500 }}
                >
                  {z.label}
                </button>,
                z.purpose ?? z.type,
                SHAPE_LABEL[z.shape],
                `v${z.version}`,
                <Can key="e" privilege={MANAGE.projects}>
                  <Button size="sm" icon="pencil" onClick={() => onEditZone(z.id)}>
                    Edit
                  </Button>
                </Can>,
              ])}
            />
          </div>
        )}
        {g ? (
          <>
            <div className="detail-grid">
              <KV k="Zone">
                <strong>{g.label}</strong>
              </KV>
              <KV k={g.purpose ? "Used for" : "Type"}>
                <strong>{g.purpose ?? g.type}</strong>
              </KV>
              <KV k="Shape">
                <strong>{SHAPE_LABEL[g.shape]}</strong>
              </KV>
              <KV k="Version">
                <strong>v{g.version}</strong>
              </KV>
              <KV k={g.shape === "Radius" ? "Centre" : "Middle point"} full>
                <strong>{fmtCoord([g.centerLat, g.centerLng])}</strong>
              </KV>
              {g.shape === "Radius" && (
                <KV k="Radius">
                  <strong>{g.radiusM.toLocaleString("en-IN")} m</strong>
                </KV>
              )}
              {g.shape === "Polygon" && (
                <KV k="Boundary pins">
                  <strong>{g.points.length}</strong>
                </KV>
              )}
              {g.shape === "Linear" && (
                <>
                  <KV k="Centre-line pins">
                    <strong>{g.points.length}</strong>
                  </KV>
                  <KV k="Corridor width">
                    <strong>
                      {g.bufferM.toLocaleString("en-IN")} m each side
                    </strong>
                  </KV>
                  <KV k="Line length" full>
                    <strong>{fmtDistance(lineLengthM(g.points))}</strong>
                  </KV>
                </>
              )}
              <KV k="Area">
                <strong>{fmtArea(areaOf(draft))}</strong>
              </KV>
              <KV k="Last changed" full>
                <strong>{fmtDateTime(g.updatedAt)}</strong>
                <Muted> · {g.updatedBy}</Muted>
              </KV>
            </div>
            {isPinned(g.shape) && (
              <details className="faq-row" style={{ marginTop: 12 }}>
                <summary>
                  <span>
                    {g.shape === "Linear"
                      ? "Centre-line points"
                      : "Boundary points"}
                  </span>
                </summary>
                <MiniTable
                  head={["Pin", "Latitude", "Longitude"]}
                  rows={g.points.map((p, i) => [
                    <strong key="n">{i + 1}</strong>,
                    p[0].toFixed(6),
                    p[1].toFixed(6),
                  ])}
                />
              </details>
            )}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>
            Use <strong>Draw</strong> to drop pins for a polygon, set a circle,
            or draw a linear corridor along a road or canal.
          </p>
        )}
      </Card>
    </div>
  );
}

function GeoEdit({
  project,
  zone,
  start,
  onDone,
  fallback,
}: {
  project: Project;
  zone?: GeoZone;
  start: Draft;
  onDone: () => void;
  fallback?: LatLng;
}) {
  const saveZoneDraft = useCore((s) => s.saveZoneDraft);
  const remote = isRemote(project);
  const [purpose, setPurpose] = useState<"Attendance" | "Equipment">(zone?.purpose ?? "Attendance");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  // one Idempotency-Key per save of this draft; a retry after a lost connection reuses it
  const [pending, setPending] = useState<{ key: string; body: string } | null>(null);
  const zones = useCore((s) => zonesOf(s.projects, project.id));
  const [label, setLabel] = useState(
    zone?.label ?? (zones.length ? "" : "Main location"),
  );
  const [ztype, setZtype] = useState<GeoZoneType>(zone?.type ?? "Other");
  const [d, setD] = useState<Draft>(start);
  const [fit, setFit] = useState(0);
  const [text, setText] = useState(
    start.points.map((p) => `${p[0]}, ${p[1]}`).join("\n"),
  );
  const [textError, setTextError] = useState("");
  const [lat, setLat] = useState(start.center ? String(start.center[0]) : "");
  const [lng, setLng] = useState(start.center ? String(start.center[1]) : "");
  const [centreError, setCentreError] = useState("");
  const [tried, setTried] = useState(false);
  const issues = problems(d);
  const g = zone;
  const lineWord = d.shape === "Linear" ? "centre-line" : "boundary";

  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setCentre = (c: LatLng) => {
    patch({ center: c });
    setLat(String(c[0]));
    setLng(String(c[1]));
    setCentreError("");
  };
  const onMapClick = (p: LatLng) => {
    if (d.shape === "Radius") return setCentre(p);
    if (d.points.length >= MAX_PINS) return notify(`At most ${MAX_PINS} pins.`);
    patch({ points: [...d.points, p] });
  };
  const applyText = () => {
    const { points, bad } = parsePoints(text);
    if (bad.length)
      return setTextError(
        `Line${bad.length === 1 ? "" : "s"} ${bad.join(", ")}: use "latitude, longitude", e.g. 17.4031, 78.5570.`,
      );
    const need = d.shape === "Linear" ? 2 : 3;
    if (points.length < need)
      return setTextError(`Enter at least ${need} points.`);
    setTextError("");
    patch({ points });
    setFit((n) => n + 1);
    notify(`${points.length} ${lineWord} points placed on the map`);
  };
  const applyCentre = () => {
    const la = Number(lat);
    const ln = Number(lng);
    if (
      !lat.trim() ||
      !lng.trim() ||
      !Number.isFinite(la) ||
      !Number.isFinite(ln) ||
      Math.abs(la) > 90 ||
      Math.abs(ln) > 180
    )
      return setCentreError("Latitude is −90 to 90 and longitude −180 to 180.");
    setCentre([la, ln]);
    setFit((n) => n + 1);
  };
  const save = async () => {
    setTried(true);
    if (issues.length || !label.trim()) return;
    if (!(await requireStepUp(`Change the geo-fence for ${project.code}`, { allowPassword: true })))
      return notify("Geo-fence not changed: verification cancelled");
    const c = d.shape === "Radius" ? d.center! : centroid(d.points);
    const draft = {
      label: label.trim(),
      type: ztype,
      purpose,
      shape: d.shape,
      centerLat: +c[0].toFixed(6),
      centerLng: +c[1].toFixed(6),
      radiusM: d.shape === "Radius" ? Math.round(d.radiusM) : 0,
      points: isPinned(d.shape) ? d.points : [],
      bufferM: d.shape === "Linear" ? Math.round(d.bufferM) : 0,
    };
    const body = JSON.stringify(draft);
    const key = pending?.body === body ? pending.key : idempotencyKey();
    setPending({ key, body });
    setSaveError("");
    setSaving(true);
    try {
      const saved = await saveZoneDraft(project.id, draft, zone?.id, key);
      setPending(null);
      notify(`Geo-fence saved as v${saved.version}`);
      onDone();
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== "NETWORK_ERROR") setPending(null);
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        await useCore.getState().loadProjectParts(project.id);
        setSaveError("Someone else changed this zone. The latest version is loaded; cancel and edit it again.");
      } else setSaveError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="form-layout">
      <Card
        title={g ? "Edit geo-fence zone" : "Add geo-fence zone"}
        subtitle={HINT[d.shape]}
      >
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <FormGroup
            label="Zone name"
            required
            error={tried && !label.trim() ? "Enter a zone name." : undefined}
          >
            {(id, p) => (
              <Input
                {...a11y(id, p)}
                value={label}
                placeholder="Enter zone name, e.g. Main location, Mess"
                onChange={(e) => setLabel(e.target.value)}
              />
            )}
          </FormGroup>
          {remote ? (
            <FormGroup label="Used for" helper="Attendance zones accept attendance; equipment zones track machines.">
              {(id, p) => (
                <Select
                  {...a11y(id, p)}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value as "Attendance" | "Equipment")}
                >
                  <option>Attendance</option>
                  <option>Equipment</option>
                </Select>
              )}
            </FormGroup>
          ) : (
          <FormGroup label="Zone type">
            {(id, p) => (
              <Select
                {...a11y(id, p)}
                value={ztype}
                onChange={(e) => setZtype(e.target.value as GeoZoneType)}
              >
                {["Head Office", "Mess", "Store yard", "Gate", "Other"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            )}
          </FormGroup>
          )}
        </div>
        <div
          className="row-actions"
          style={{ justifyContent: "space-between", marginBottom: 12 }}
        >
          <div className="seg-tabs" role="group" aria-label="Fence shape">
            <button
              type="button"
              aria-pressed={d.shape === "Polygon"}
              onClick={() => patch({ shape: "Polygon" })}
            >
              Polygon (pins)
            </button>
            <button
              type="button"
              aria-pressed={d.shape === "Radius"}
              onClick={() => {
                if (!d.center && d.points.length) setCentre(centroid(d.points));
                patch({ shape: "Radius" });
              }}
            >
              Circle
            </button>
            <button
              type="button"
              aria-pressed={d.shape === "Linear"}
              onClick={() => patch({ shape: "Linear" })}
            >
              Linear (corridor)
            </button>
          </div>
          <div className="row-actions">
            {isPinned(d.shape) && (
              <>
                <Button
                  size="sm"
                  icon="undo"
                  disabled={!d.points.length}
                  onClick={() => patch({ points: d.points.slice(0, -1) })}
                >
                  Undo pin
                </Button>
                <Button
                  size="sm"
                  icon="trash"
                  disabled={!d.points.length}
                  onClick={() => patch({ points: [] })}
                >
                  Clear pins
                </Button>
              </>
            )}
            <Button size="sm" icon="fit" onClick={() => setFit((n) => n + 1)}>
              Fit to fence
            </Button>
          </div>
        </div>
        <GeoMap
          editable
          label={`Draw the geo-fence of ${project.name}`}
          shape={d.shape}
          center={d.center}
          radiusM={d.radiusM}
          points={d.points}
          bufferM={d.bufferM}
          fitKey={fit}
          height={440}
          fallback={fallback}
          onMapClick={onMapClick}
          onCenterMove={setCentre}
          onPointMove={(i, p) =>
            patch({ points: d.points.map((x, j) => (j === i ? p : x)) })
          }
          onPointRemove={(i) =>
            patch({ points: d.points.filter((_, j) => j !== i) })
          }
        />
        <div className="gauge" style={{ marginTop: 12 }}>
          <div>
            <b>
              {d.shape === "Radius"
                ? d.radiusM.toLocaleString("en-IN")
                : d.points.length}
            </b>
            <span>{d.shape === "Radius" ? "Radius (m)" : "Pins"}</span>
          </div>
          <div>
            <b>{fmtArea(areaOf(d))}</b>
            <span>Area</span>
          </div>
          <div>
            <b>{fmtDistance(lengthOf(d))}</b>
            <span>
              {d.shape === "Linear" ? "Line length" : "Boundary length"}
            </span>
          </div>
        </div>
      </Card>

      <div className="stack">
        {d.shape === "Linear" && (
          <Card
            title="Corridor width"
            subtitle="How far the fence reaches on each side of the centre line"
          >
            <FormGroup
              label="Width each side (metres)"
              required
              helper={`${MIN_B} to ${MAX_B.toLocaleString("en-IN")} m. The full corridor is twice this.`}
            >
              {(id, dsc) => (
                <div className="radius-row">
                  <input
                    type="range"
                    min={MIN_B}
                    max={MAX_B}
                    step={5}
                    value={Math.min(Math.max(d.bufferM, MIN_B), MAX_B)}
                    onChange={(e) => patch({ bufferM: Number(e.target.value) })}
                    aria-label="Corridor width slider"
                  />
                  <Input
                    id={id}
                    aria-describedby={dsc}
                    type="number"
                    min={MIN_B}
                    max={MAX_B}
                    step={5}
                    value={Number.isFinite(d.bufferM) ? d.bufferM : ""}
                    onChange={(e) =>
                      patch({
                        bufferM:
                          e.target.value === ""
                            ? Number.NaN
                            : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}
            </FormGroup>
            {d.points.length >= 2 && (
              <p style={{ margin: "10px 0 0", fontSize: 13 }}>
                <Muted>Line {fmtDistance(lineLengthM(d.points))}</Muted>
              </p>
            )}
          </Card>
        )}
        {isPinned(d.shape) ? (
          <Card
            title={
              d.shape === "Linear" ? "Centre-line points" : "Boundary points"
            }
            subtitle="Or type them in, one point per line"
          >
            <MiniTable
              head={["Pin", "Point", ""]}
              empty="No pins yet. Click the map or enter points below."
              rows={d.points.map((p, i) => [
                <strong key="n">{i + 1}</strong>,
                fmtCoord(p),
                <Button
                  key="x"
                  size="sm"
                  tone="danger"
                  icon="trash"
                  aria-label={`Remove pin ${i + 1}`}
                  onClick={() =>
                    patch({ points: d.points.filter((_, j) => j !== i) })
                  }
                />,
              ])}
            />
            <div style={{ marginTop: 14 }}>
              <FormGroup
                label={
                  d.shape === "Linear"
                    ? "Enter centre-line points"
                    : "Enter boundary points"
                }
                error={textError || undefined}
                helper={
                  d.shape === "Linear"
                    ? 'One "latitude, longitude" per line, in order from start to end.'
                    : 'One "latitude, longitude" per line, in order around the boundary.'
                }
              >
                {(id, dsc) => (
                  <Textarea
                    rows={5}
                    placeholder={
                      "17.4031, 78.5570\n17.4030, 78.5612\n17.3994, 78.5614"
                    }
                    {...a11y(id, dsc, textError)}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setTextError("");
                    }}
                  />
                )}
              </FormGroup>
              <div className="row-actions" style={{ marginTop: 8 }}>
                <Button size="sm" icon="mapPin" onClick={applyText}>
                  Place points on map
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    setText(d.points.map((p) => `${p[0]}, ${p[1]}`).join("\n"))
                  }
                  disabled={!d.points.length}
                >
                  Copy pins to text
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card title="Circle" subtitle="Centre point and radius">
            <div className="form-grid">
              <FormGroup
                label="Centre latitude"
                required
                error={centreError || undefined}
              >
                {(id, dsc) => (
                  <Input
                    inputMode="decimal"
                    {...a11y(id, dsc, centreError)}
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="Enter latitude"
                  />
                )}
              </FormGroup>
              <FormGroup label="Centre longitude" required>
                {(id, dsc) => (
                  <Input
                    inputMode="decimal"
                    {...a11y(id, dsc)}
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="Enter longitude"
                  />
                )}
              </FormGroup>
            </div>
            <div className="row-actions" style={{ marginTop: 8 }}>
              <Button size="sm" icon="target" onClick={applyCentre}>
                Move centre here
              </Button>
            </div>
            <div style={{ marginTop: 16 }}>
              <FormGroup
                label="Radius (metres)"
                required
                helper={`${MIN_R} to ${MAX_R.toLocaleString("en-IN")} m.`}
              >
                {(id, dsc) => (
                  <div className="radius-row">
                    <input
                      type="range"
                      min={MIN_R}
                      max={MAX_R}
                      step={10}
                      value={Math.min(Math.max(d.radiusM, MIN_R), MAX_R)}
                      onChange={(e) =>
                        patch({ radiusM: Number(e.target.value) })
                      }
                      aria-label="Radius slider"
                    />
                    <Input
                      id={id}
                      aria-describedby={dsc}
                      type="number"
                      min={MIN_R}
                      max={MAX_R}
                      step={10}
                      value={Number.isFinite(d.radiusM) ? d.radiusM : ""}
                      onChange={(e) =>
                        patch({
                          radiusM:
                            e.target.value === ""
                              ? Number.NaN
                              : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                )}
              </FormGroup>
            </div>
          </Card>
        )}
        <Card title="Save" enter={false}>
          {tried && issues.length > 0 && (
            <div
              className="login-error"
              role="alert"
              style={{ marginBottom: 12 }}
            >
              <span>{issues.join(" ")}</span>
            </div>
          )}
          {!tried && issues.length > 0 && (
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 13,
                color: "var(--muted)",
              }}
            >
              {issues[0]}
            </p>
          )}
          <Note title="Step-up verification" icon="shield" className="mt-0">
            Saving asks you to verify with your authenticator or passkey. Each
            save is a new version, and attendance uses it straight away.
          </Note>
          {saveError && (
            <div className="login-error" role="alert">
              <span>{saveError}</span>
            </div>
          )}
          <div className="form-actions">
            <Button onClick={onDone} disabled={saving}>Cancel</Button>
            <Button tone="primary" icon="shield" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Verify and save"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
