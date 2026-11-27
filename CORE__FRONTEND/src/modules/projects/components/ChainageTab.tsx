import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { z } from "zod";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Modal } from "@/shared/ui/Modal";
import { KV, MiniTable, Muted, Note } from "@/shared/ui/Extras";
import { FormGroup, Input } from "@/shared/ui/Field";
import type { ChainageMarker, Project } from "@/modules/core-data";
import { useRemoteSave } from "@/shared/hooks/useRemoteSave";
import { a11y, num, req } from "@/shared/lib/core";
import { ApiError, errorText } from "@/shared/lib/api";
import { isRemote, useCore } from "@/modules/core-data";
import { KM } from "../utils/km";
import { fmtDate } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";

/** The chainage of a project: its range and markers, and the editors for them. */
// ---------------- Chainage ----------------
const markerSchema = z.object({
  km: num("Chainage", 0),
  label: req("Label"),
});

export function ChainageView({
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
          head={["Chainage", "Label"]}
          empty="No markers yet. Use Edit chainage to add them one by one or from a CSV file."
          rows={markers.map((m) => [
            <strong key="k">{KM(m.km)}</strong>,
            m.label,
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

/** Edit one chainage marker: km and label. Mounted only while open. */
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

export function ChainageEdit({
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
  const marker = useForm({
    resolver: zodResolver(markerSchema),
    defaultValues: { km: ch.startKm, label: "" },
  });
  const me = marker.formState.errors;

  const addMarker = marker.handleSubmit(async (v) => {
    if (ch.markers.some((m) => m.km === v.km))
      return marker.setError("km", {
        message: "A marker already exists at this km.",
      });
    try {
      await addMarkers(project.id, [v]);
      marker.reset({ km: v.km, label: "" });
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
  return (
    <div className="grid dash-grid">
      <Card
        title="Edit chainage markers"
        subtitle={`Linear distance markers, ${KM(ch.startKm)} to ${KM(ch.endKm)}`}
      >
        <MiniTable
          head={["Chainage", "Label", ""]}
          empty="No markers yet."
          rows={ch.markers.map((m) => [
            <strong key="k">{KM(m.km)}</strong>,
            m.label,
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
    </div>
  );
}
