import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { BulkUpload, type RowCheck } from "@/shared/ui/data/BulkUpload";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Modal } from "@/shared/ui/Modal";
import { KV, MiniTable, Muted, Note, Tabs } from "@/shared/ui/Extras";
import { FormGroup, Input, Select } from "@/shared/ui/Field";
import { PageHead } from "@/modules/shell";
import { StatusBadge } from "@/shared/ui/Status";
import type { ChainageMarker, Project } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { useRemoteSave } from "@/shared/hooks/useRemoteSave";
import { bulk } from "@/shared/lib/bulk";
import { a11y, ACTIVE_TONE, num, req, uid } from "@/shared/lib/core";
import { ApiError, errorText } from "@/shared/lib/api";
import { isRemote } from "@/modules/core-data";
import { KM } from "../utils/km";
import { fmtDate } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { Can, MANAGE, useCanManage } from "@/modules/auth";
import { useCore } from "@/modules/core-data";
import { SiteForm } from "../components/SiteForm";

const TABS = ["Details", "Chainage"] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab =>
  !!v && (TABS as readonly string[]).includes(v);

/** One site. Details are the site's own; the Chainage tab shows the chainage of the location's project. */
export default function SiteDetail() {
  const ref = useRef<HTMLDivElement>(null);
  const { id = "" } = useParams();
  useEnter(ref, `site-${id}`);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const site = useCore((s) => s.sites.find((x) => x.id === id));
  const projects = useCore((s) => s.projects);
  const tabParam = params.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "Details";
  // the location's own project; a location with none falls back to the first project
  const project =
    projects.find((p) => p.id === site?.projectId) ?? projects[0];
  const [editingState, setEditing] = useState<Tab | null>(
    params.get("edit") === "1" ? tab : null,
  );
  // the editors (the URL can ask for one) open only for a user who holds the privilege
  const canEdit = useCanManage(MANAGE.projects);
  const editing = canEdit ? editingState : null;
  const go = (t: Tab, edit = false, proj = project?.id) => {
    const next: Record<string, string> = {};
    if (t !== "Details") next.tab = t;
    if (t === "Chainage" && proj) next.project = proj;
    setParams(next, { replace: true });
    setEditing(edit ? t : null);
  };
  // a project read from the API keeps its markers in their own table: read them when the Chainage tab opens
  const loadParts = useCore((s) => s.loadProjectParts);
  const remoteProject =
    tab === "Chainage" && isRemote(project) ? project.id : "";
  useEffect(() => {
    if (remoteProject) void loadParts(remoteProject);
  }, [remoteProject, loadParts]);
  const back = (
    <Button icon="chevL" onClick={() => navigate("/sites")}>
      Back to locations
    </Button>
  );
  if (!site) {
    return (
      <div ref={ref}>
        <PageHead
          crumb="Locations"
          title="Location not found"
          desc={`No location with ID ${id}.`}
          actions={back}
        />
        <Card>
          <EmptyState icon="mapPin" title="Nothing to show">
            Go back to the locations list.
          </EmptyState>
        </Card>
      </div>
    );
  }
  const done = () => setEditing(null);
  const editBtn = (t: Tab, label = "Edit") => (
    <Can privilege={MANAGE.projects}>
      <Button size="sm" icon="pencil" onClick={() => setEditing(t)}>
        {label}
      </Button>
    </Can>
  );

  return (
    <div ref={ref}>
      <PageHead
        crumb={site.code}
        title={site.name}
        desc={`Location ${site.code}.`}
        actions={back}
      />
      <div style={{ marginBottom: 14 }} data-enter>
        <Tabs
          label="Location sections"
          value={tab}
          onChange={(t) => go(t)}
          items={TABS}
        />
      </div>

      {tab === "Details" &&
        (editing === "Details" ? (
          <Card className="max-w-[920px]" title="Edit location details">
            <SiteForm
              site={site}
              onCancel={done}
              onSaved={() => {
                done();
                notify("Location saved");
              }}
            />
          </Card>
        ) : (
          <Card
            className="max-w-[920px]"
            title="Location details"
            action={editBtn("Details")}
          >
            <div className="detail-grid">
              <KV k="Status">
                <StatusBadge tone={ACTIVE_TONE(site.status)}>
                  {site.status}
                </StatusBadge>
              </KV>
              <KV k="Location code">
                <strong>{site.code}</strong>
              </KV>
              <KV k="Address" full>
                <strong>
                  {site.addressLine}, {site.city}, {site.state} {site.pin}
                </strong>
              </KV>
              <KV k="Location in-charge">
                <strong>{site.inCharge}</strong>
              </KV>
              <KV k="Contact">
                <strong>{site.phone}</strong>
                <Muted> · {site.email}</Muted>
              </KV>
              <KV k="Latitude, longitude">
                {site.latitude != null && site.longitude != null ? (
                  <a
                    className="id-link"
                    href={`https://www.openstreetmap.org/?mlat=${site.latitude}&mlon=${site.longitude}#map=16/${site.latitude}/${site.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {site.latitude}, {site.longitude}
                  </a>
                ) : (
                  <Muted>Not set</Muted>
                )}
              </KV>
            </div>
          </Card>
        ))}

      {tab === "Chainage" &&
        (!project ? (
          <Card>
            <EmptyState icon="ruler" title="No project yet">
              Chainage belongs to a project. Create one in Projects to add
              markers.
            </EmptyState>
          </Card>
        ) : (
          <>
            {editing === "Chainage" ? (
              <ChainageEdit project={project} onDone={done} />
            ) : (
              <ChainageView
                project={project}
                action={editBtn("Chainage", "Edit chainage")}
              />
            )}
          </>
        ))}
    </div>
  );
}

// ---------------- Chainage ----------------
const markerSchema = z.object({
  km: num("Chainage", 0),
  label: req("Label"),
  wbsCode: z.string(),
});

function ChainageView({
  project,
  action,
}: {
  project: Project;
  action: ReactNode;
}) {
  const { startKm, endKm, markers } = project.chainage;
  return (
    <div className="grid dash-grid">
      <Card
        title="Chainage markers"
        subtitle={`${markers.length} marker${markers.length === 1 ? "" : "s"} between ${KM(startKm)} and ${KM(endKm)}`}
        action={action}
      >
        <MiniTable
          head={["Chainage", "Label", "WBS"]}
          empty="No markers yet. Use Edit chainage to add them one by one or from a CSV file."
          rows={markers.map((m) => [
            <strong key="k">{KM(m.km)}</strong>,
            m.label,
            m.wbsCode || "—",
          ])}
        />
      </Card>
      <Card
        title="Chainage range"
        subtitle={`${project.name} starts ${fmtDate(project.startDate)}`}
      >
        <div className="detail-grid">
          <KV k="Start">
            <strong>{KM(startKm)}</strong>
          </KV>
          <KV k="End">
            <strong>{KM(endKm)}</strong>
          </KV>
          <KV k="Length" full>
            <strong>
              {(endKm - startKm).toLocaleString("en-IN", {
                maximumFractionDigits: 3,
              })}{" "}
              km
            </strong>
          </KV>
        </div>
      </Card>
    </div>
  );
}

/** Edit one chainage marker: km, label and WBS item. Mounted only while open. */
function MarkerEditDialog({
  project,
  marker,
  onClose,
}: {
  project: Project;
  marker: ChainageMarker;
  onClose: () => void;
}) {
  const editMarker = useCore((s) => s.editMarker);
  const ch = project.chainage;
  const [formError, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors: e, isSubmitting },
  } = useForm({
    resolver: zodResolver(markerSchema),
    defaultValues: {
      km: marker.km,
      label: marker.label,
      wbsCode: marker.wbsCode,
    },
  });
  const submit = handleSubmit(async (v) => {
    setFormError("");
    if (ch.markers.some((m) => m.id !== marker.id && m.km === v.km))
      return setError("km", { message: "A marker already exists at this km." });
    try {
      await editMarker(project.id, marker.id, v);
      notify(`Marker saved at ${KM(v.km)}`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        await useCore.getState().loadProjectParts(project.id);
        return setFormError(
          "Someone else changed this marker. The latest version is loaded; close this and edit it again.",
        );
      }
      if (err instanceof ApiError && err.code.endsWith("_DUPLICATE"))
        return setError("km", {
          message: "A marker already exists at this km.",
        });
      setFormError(errorText(err));
    }
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit marker at ${KM(marker.km)}`}
    >
      <form noValidate onSubmit={submit}>
        {formError && (
          <div
            className="login-error"
            role="alert"
            style={{ marginBottom: 14 }}
          >
            <span>{formError}</span>
          </div>
        )}
        <div className="form-grid">
          <FormGroup label="Chainage (km)" required error={e.km?.message}>
            {(id, d) => (
              <Input
                type="number"
                step="0.001"
                {...a11y(id, d, e.km?.message)}
                {...register("km", { valueAsNumber: true })}
                id={id}
              />
            )}
          </FormGroup>
          <FormGroup label="Label" required error={e.label?.message}>
            {(id, d) => (
              <Input
                {...a11y(id, d, e.label?.message)}
                {...register("label")}
                id={id}
              />
            )}
          </FormGroup>
          <FormGroup label="WBS item" full>
            {(id) => (
              <Select id={id} {...register("wbsCode")}>
                <option value="">None</option>
                {project.wbs.map((w) => (
                  <option key={w.id} value={w.code}>
                    {w.code} {w.name}
                  </option>
                ))}
              </Select>
            )}
          </FormGroup>
        </div>
        <div className="form-actions">
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button tone="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save marker"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Start and end km of the project's chainage (PATCH /projects/{id}: both >= 0, start <= end). */
function RangeEdit({ project }: { project: Project }) {
  const saveRange = useCore((s) => s.saveChainageRangeRemote);
  const loadProjects = useCore((s) => s.loadProjects);
  const { run, error, saving } = useRemoteSave(async () => {
    await loadProjects();
  });
  const ch = project.chainage;
  const [start, setStart] = useState(String(ch.startKm));
  const [end, setEnd] = useState(String(ch.endKm));
  const [fe, setFe] = useState<{ start?: string; end?: string }>({});
  const s = Number(start);
  const e = Number(end);
  const valid =
    start.trim() !== "" &&
    end.trim() !== "" &&
    Number.isFinite(s) &&
    Number.isFinite(e) &&
    s >= 0 &&
    e >= s;
  // the server does not check markers against the range, so markers outside it are a warning, not a block
  const outside = valid ? ch.markers.filter((m) => m.km < s || m.km > e) : [];
  const save = async () => {
    const errs: typeof fe = {};
    if (start.trim() === "" || !Number.isFinite(s) || s < 0)
      errs.start = "Enter a start km of 0 or more.";
    if (end.trim() === "" || !Number.isFinite(e) || e < 0)
      errs.end = "Enter an end km of 0 or more.";
    else if (!errs.start && e < s)
      errs.end = "The end km must not be less than the start km.";
    setFe(errs);
    if (errs.start || errs.end) return;
    const done = await run({ id: project.id, s, e }, (key) =>
      saveRange(project.id, s, e, key).then(() => true),
    );
    if (done) notify(`Chainage range saved: ${KM(s)} to ${KM(e)}`);
  };
  return (
    <Card
      title="Chainage range"
      subtitle={`${project.name} starts ${fmtDate(project.startDate)}`}
    >
      <div className="form-grid">
        <FormGroup label="Start (km)" required error={fe.start}>
          {(id, d) => (
            <Input
              type="number"
              step="0.001"
              min={0}
              {...a11y(id, d, fe.start)}
              value={start}
              onChange={(ev) => {
                setStart(ev.target.value);
                setFe({});
              }}
            />
          )}
        </FormGroup>
        <FormGroup label="End (km)" required error={fe.end}>
          {(id, d) => (
            <Input
              type="number"
              step="0.001"
              min={0}
              {...a11y(id, d, fe.end)}
              value={end}
              onChange={(ev) => {
                setEnd(ev.target.value);
                setFe({});
              }}
            />
          )}
        </FormGroup>
      </div>
      {!ch.rangeSaved && (
        <Muted>
          No range is saved yet; the one shown covers the saved markers.
        </Muted>
      )}
      {outside.length > 0 && (
        <Note title="Markers outside this range" icon="alert">
          {outside.map((m) => KM(m.km)).join(", ")}{" "}
          {outside.length === 1 ? "falls" : "fall"} outside {KM(s)} to {KM(e)}.
          You can still save; check the markers or the range.
        </Note>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button
          icon="check"
          disabled={saving || !isRemote(project)}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save Range"}
        </Button>
      </div>
    </Card>
  );
}

function ChainageEdit({
  project,
  onDone,
}: {
  project: Project;
  onDone: () => void;
}) {
  const addMarkers = useCore((s) => s.addMarkers);
  const removeMarker = useCore((s) => s.removeMarker);
  const [editingMarker, setEditingMarker] = useState<ChainageMarker | null>(
    null,
  );
  const ch = project.chainage;
  const [upload, setUpload] = useState(false);
  const marker = useForm({
    resolver: zodResolver(markerSchema),
    defaultValues: { km: ch.startKm, label: "", wbsCode: "" },
  });
  const me = marker.formState.errors;
  const wbsCodes = project.wbs.map((w) => w.code);

  const addMarker = marker.handleSubmit(async (v) => {
    if (ch.markers.some((m) => m.km === v.km))
      return marker.setError("km", {
        message: "A marker already exists at this km.",
      });
    try {
      await addMarkers(project.id, [v]);
      marker.reset({ km: v.km, label: "", wbsCode: v.wbsCode });
      notify(`Marker added at ${KM(v.km)}`);
    } catch (err) {
      marker.setError("km", {
        message:
          err instanceof ApiError && err.code.endsWith("_DUPLICATE")
            ? "A marker already exists at this km."
            : errorText(err),
      });
    }
  });
  const dropMarker = async (m: ChainageMarker) => {
    try {
      await removeMarker(project.id, m.id);
      notify("Marker removed");
    } catch (err) {
      notify(
        err instanceof ApiError && err.code.endsWith("_IN_USE")
          ? `The marker at ${KM(m.km)} is used by a store or other record, so it cannot be removed.`
          : `Marker not removed: ${errorText(err)}`,
        6000,
      );
    }
  };
  const importMarkers = async (list: ChainageMarker[]) => {
    const failed = await addMarkers(project.id, list);
    const saved = list.length - failed.length;
    notify(
      failed.length
        ? `${saved} of ${list.length} markers saved. Not saved: ${failed.join("; ")}`
        : `${saved} marker${saved === 1 ? "" : "s"} saved`,
      failed.length ? 10000 : 2800,
    );
  };
  const validate = (
    records: Record<string, string>[],
  ): RowCheck<ChainageMarker>[] => {
    const kms = records.map((r) => r.km);
    return records.map((r, i) => {
      const km = bulk.num(r.km);
      const errors: string[] = [];
      if (!Number.isFinite(km)) errors.push("km must be a number, e.g. 12.5.");
      else if (km < 0) errors.push("km must be 0 or more.");
      else if (ch.markers.some((m) => m.km === km))
        errors.push("A marker already exists at this km.");
      else if (kms.indexOf(r.km) !== i)
        errors.push("The same km appears twice in the file.");
      if (!r.label) errors.push("Label is required.");
      if (r.wbs_code && !wbsCodes.includes(r.wbs_code))
        errors.push(`WBS code ${r.wbs_code} is not in this project.`);
      const label = `${Number.isFinite(km) ? KM(km) : r.km || "?"} · ${r.label || "no label"}`;
      return errors.length
        ? { label, errors }
        : {
            label,
            value: {
              id: uid("CH"),
              km,
              label: r.label,
              wbsCode: r.wbs_code ?? "",
            },
          };
    });
  };

  return (
    <div className="grid dash-grid">
      <Card
        title="Edit chainage markers"
        subtitle={`Linear distance markers, ${KM(ch.startKm)} to ${KM(ch.endKm)}`}
        action={
          <Button size="sm" icon="upload" onClick={() => setUpload(true)}>
            Bulk upload
          </Button>
        }
      >
        <MiniTable
          head={["Chainage", "Label", "WBS", ""]}
          empty="No markers yet."
          rows={ch.markers.map((m) => [
            <strong key="k">{KM(m.km)}</strong>,
            m.label,
            m.wbsCode || "—",
            <span key="d" style={{ display: "inline-flex", gap: 6 }}>
              <Button
                size="sm"
                icon="pencil"
                aria-label={`Edit marker at ${KM(m.km)}`}
                onClick={() => setEditingMarker(m)}
              >
                Edit
              </Button>
              <Button
                size="sm"
                tone="danger"
                icon="trash"
                aria-label={`Remove marker at ${KM(m.km)}`}
                onClick={() => void dropMarker(m)}
              >
                Remove
              </Button>
            </span>,
          ])}
        />
        {editingMarker && (
          <MarkerEditDialog
            project={project}
            marker={editingMarker}
            onClose={() => setEditingMarker(null)}
          />
        )}
        <h3 className="section-t">Add marker</h3>
        <form noValidate onSubmit={addMarker}>
          <div className="form-grid">
            <FormGroup label="Chainage (km)" required error={me.km?.message}>
              {(id, d) => (
                <Input
                  type="number"
                  step="0.001"
                  {...a11y(id, d, me.km?.message)}
                  {...marker.register("km", { valueAsNumber: true })}
                />
              )}
            </FormGroup>
            <FormGroup label="Label" required error={me.label?.message}>
              {(id, d) => (
                <Input
                  placeholder="Enter marker label"
                  {...a11y(id, d, me.label?.message)}
                  {...marker.register("label")}
                />
              )}
            </FormGroup>
            <FormGroup label="WBS item" full>
              {(id) => (
                <Select id={id} {...marker.register("wbsCode")}>
                  <option value="">None</option>
                  {project.wbs.map((w) => (
                    <option key={w.id} value={w.code}>
                      {w.code} {w.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormGroup>
          </div>
          <div className="form-actions">
            <Button type="submit" icon="plus">
              Add marker
            </Button>
          </div>
        </form>
      </Card>
      <div className="stack">
        <RangeEdit
          key={`${project.id}-${project.rowVersion ?? 0}`}
          project={project}
        />
        <Card enter={false}>
          <Note title="Changes save as you go" icon="info" className="mt-0">
            Each marker is saved to the server as you add or remove it. Save the
            range with its own button.
          </Note>
          <div className="form-actions">
            <Button tone="primary" icon="check" onClick={onDone}>
              Save Changes
            </Button>
          </div>
        </Card>
      </div>
      <BulkUpload
        open={upload}
        onOpenChange={setUpload}
        noun="chainage markers"
        templateName={`chainage-${project.id.toLowerCase()}`}
        fields={[
          {
            key: "km",
            label: "Chainage in km",
            required: true,
            example: String(ch.startKm + 1.5),
            hint: "0 or more",
          },
          {
            key: "label",
            label: "Marker label",
            required: true,
            example: "Culvert 4",
          },
          {
            key: "wbs_code",
            label: "WBS code (optional)",
            example: wbsCodes[0] ?? "",
            hint: wbsCodes.length
              ? wbsCodes.join(", ")
              : "This project has no WBS yet",
          },
        ]}
        validate={validate}
        onImport={(list) => void importMarkers(list)}
      />
    </div>
  );
}
