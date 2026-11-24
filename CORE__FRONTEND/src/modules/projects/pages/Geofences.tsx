import { useEffect, useMemo, useRef, useState } from "react";
import { PageHead } from "@/modules/shell";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { MiniTable, Muted } from "@/shared/ui/Extras";
import { FormGroup, Select } from "@/shared/ui/Field";
import { useEnter } from "@/shared/hooks/useMotion";
import { errorText } from "@/shared/lib/api";
import { requireStepUp } from "@/shared/lib/stepUp";
import { notify } from "@/shared/lib/toast";
import { Can, MANAGE } from "@/modules/auth";
import type { GeoZone, LatLng, Project } from "@/modules/core-data";
import { useCore } from "@/modules/core-data";
import { GeoFenceTab } from "../components/GeoFenceTab";
import { GeoMap, type GeoMapZone } from "../components/GeoMap";
import { SHAPE_LABEL } from "../utils/geo";

interface ZoneRow {
  project: Project;
  zone: GeoZone;
}

/** What the page is editing: a zone of a project, or a new zone for it. */
type Target = { projectId: string; zoneId?: string; adding?: boolean };

const asMapZone = (r: ZoneRow): GeoMapZone => ({
  id: r.zone.id,
  label: `${r.project.name} · ${r.zone.label}`,
  shape: r.zone.shape,
  center: [r.zone.centerLat, r.zone.centerLng] as LatLng,
  radiusM: r.zone.radiusM,
  points: r.zone.points,
  bufferM: r.zone.bufferM,
});

/**
 * Geofences: the zones of one project on a large map, with a project picker on top (the first project is chosen
 * to start). Click a zone on the map, or pick it in the list, to select it; Edit opens the drawing tools for it.
 */
export default function Geofences() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "geofences");
  const projects = useCore((s) => s.projects);
  const loadAllZones = useCore((s) => s.loadAllZones);
  const removeZone = useCore((s) => s.removeZone);
  // one project at a time: the first one until another is chosen
  const [pick, setPick] = useState("");
  const filter = (projects.find((p) => p.id === pick) ?? projects[0])?.id ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);

  // zones are read for the whole company at once, again whenever the list of projects arrives or changes in size
  useEffect(() => {
    void loadAllZones();
  }, [loadAllZones, projects.length]);

  const rows = useMemo<ZoneRow[]>(
    () => projects.filter((p) => p.id === filter).flatMap((p) => p.zones.map((zone) => ({ project: p, zone }))),
    [projects, filter],
  );
  const selected = rows.find((r) => r.zone.id === selectedId);
  const others = useMemo(() => rows.filter((r) => r.zone.id !== selected?.zone.id).map(asMapZone), [rows, selected]);

  const remove = async ({ project, zone }: ZoneRow) => {
    if (!window.confirm(`Delete the zone "${zone.label}" of ${project.name}? Attendance will no longer be accepted inside it.`)) return;
    if (!(await requireStepUp(`Delete geo-fence zone ${zone.label} of ${project.code}`, { allowPassword: true })))
      return notify("Zone not deleted: verification cancelled");
    try {
      await removeZone(project.id, zone.id);
      notify(`Zone "${zone.label}" deleted`);
    } catch (err) {
      notify(`Zone not deleted: ${errorText(err)}`, 6000);
    }
  };

  if (target) {
    const project = projects.find((p) => p.id === target.projectId);
    if (project)
      return (
        <div ref={ref}>
          <PageHead
            crumb="Projects"
            title="Geofences"
            desc={`${project.name}: ${target.adding ? "draw a new zone." : "change the selected zone."}`}
            actions={<Button icon="chevL" onClick={() => setTarget(null)}>Back to all geofences</Button>}
          />
          <GeoFenceTab
            key={`${project.id}-${target.zoneId ?? "new"}`}
            project={project}
            editing
            onEdit={() => undefined}
            onDone={() => setTarget(null)}
            initialZoneId={target.zoneId}
            startAdding={target.adding}
          />
        </div>
      );
  }

  // a new zone belongs to the project being shown
  const addFor = filter;
  const fallback: LatLng | undefined = rows[0] ? [rows[0].zone.centerLat, rows[0].zone.centerLng] : undefined;

  return (
    <div ref={ref}>
      <PageHead crumb="Projects" title="Geofences" desc="The geofence zones of a project on one map. Choose the project, select a zone, then edit it." />
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Project">
          {(id) => (
            <Select
              id={id}
              value={filter}
              onChange={(e) => {
                setPick(e.target.value);
                setSelectedId(null);
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          )}
        </FormGroup>
      </div>
      <Card
        title="Geo-fence map"
        subtitle={
          selected
            ? `${selected.project.name} · ${selected.zone.label} · ${SHAPE_LABEL[selected.zone.shape]} · version ${selected.zone.version}`
            : `${rows.length} zone${rows.length === 1 ? "" : "s"}`
        }
        action={
          <div className="row-actions">
            <Can privilege={MANAGE.projects}>
              {selected && (
                <Button size="sm" icon="pencil" onClick={() => setTarget({ projectId: selected.project.id, zoneId: selected.zone.id })}>
                  Edit zone
                </Button>
              )}
              <Button
                size="sm"
                icon="plus"
                disabled={!addFor}
                onClick={() => setTarget({ projectId: addFor, adding: true })}
              >
                Add zone
              </Button>
            </Can>
          </div>
        }
      >
        <GeoMap
          label="All geo-fence zones"
          shape={selected?.zone.shape ?? "Polygon"}
          center={selected ? ([selected.zone.centerLat, selected.zone.centerLng] as LatLng) : null}
          radiusM={selected?.zone.radiusM ?? 0}
          points={selected?.zone.points ?? []}
          bufferM={selected?.zone.bufferM ?? 0}
          others={others}
          onOtherSelect={setSelectedId}
          fitKey={`${filter}-${rows.length}`}
          fallback={fallback}
          height="max(520px, calc(100vh - 360px))"
        />
        <Muted>
          {rows.length
            ? "Click a zone on the map, or pick one in the list below, to select it. The selected zone is drawn in blue."
            : "No geofence has been drawn yet for this selection."}
        </Muted>
      </Card>
      <div style={{ marginTop: 16 }}>
        <Card title="Zones" subtitle="Attendance is accepted inside any zone of its project.">
          <MiniTable
            label="Geo-fence zones"
            head={["Project", "Zone", "Used for", "Shape", "Version", ""]}
            empty="No geofence zones yet."
            rows={rows.map((r) => [
              r.project.name,
              <button
                key="z"
                type="button"
                className="link-btn"
                aria-current={selected?.zone.id === r.zone.id}
                style={{ fontWeight: selected?.zone.id === r.zone.id ? 700 : 500 }}
                onClick={() => setSelectedId(r.zone.id)}
              >
                {r.zone.label}
              </button>,
              r.zone.purpose ?? r.zone.type,
              SHAPE_LABEL[r.zone.shape],
              `v${r.zone.version}`,
              <Can key="a" privilege={MANAGE.projects}>
                <div className="row-actions">
                  <Button size="sm" icon="pencil" onClick={() => setTarget({ projectId: r.project.id, zoneId: r.zone.id })}>
                    Edit
                  </Button>
                  <Button size="sm" icon="trash" onClick={() => void remove(r)}>
                    Delete
                  </Button>
                </div>
              </Can>,
            ])}
          />
        </Card>
      </div>
    </div>
  );
}
