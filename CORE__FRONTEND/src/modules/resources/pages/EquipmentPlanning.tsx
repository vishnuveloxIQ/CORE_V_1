import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BulkUpload, type RowCheck } from "@/shared/ui/data/BulkUpload";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Button } from "@/shared/ui/Button";
import { FormGroup, Input, Select, Textarea } from "@/shared/ui/Field";
import { Modal } from "@/shared/ui/Modal";
import { PageHead } from "@/modules/shell";
import { StatTile } from "@/shared/ui/StatTile";
import { StatusBadge } from "@/shared/ui/Status";
import { EQUIPMENT_TYPES } from "@/modules/core-data";
import type { PlanLine } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { bulk, saveEach } from "@/shared/lib/bulk";
import { a11y, num, req } from "@/shared/lib/core";
import { fmtDate } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { newId, nextCode, projectOf, useCore } from "@/modules/core-data";
import { ApiError, errorText, idempotencyKey } from "@/shared/lib/api";
import { Can, MANAGE } from '@/modules/auth';

const schema = z
  .object({
    equipmentType: req("Equipment type"),
    projectId: z.string().min(1, "Choose the project."),
    plannedQty: num("Quantity", 1).int("Whole units only."),
    from: z.string().min(1, "Pick a start date."),
    to: z.string().min(1, "Pick an end date."),
    reason: z.string().trim().min(3, "Say what the units are for."),
  })
  .refine((v) => !v.from || !v.to || v.to > v.from, {
    path: ["to"],
    message: "End date must be after the start date.",
  });

/** 3.5 Equipment planning: CORE decides units needed per type per site or project. */
export default function EquipmentPlanning() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "eq-planning");
  const { planLines, units, projects, saveEquipmentPlanRemote, cancelPlanRemote } = useCore();
  const [edit, setEdit] = useState<PlanLine | "new" | null>(null);
  const [upload, setUpload] = useState(false);
  const [projectId, setProjectId] = useState("");
  const rows = projectId
    ? planLines.filter((l) => l.projectId === projectId)
    : planLines;
  const shownUnits = projectId
    ? units.filter((u) => projectOf(projects, u.chainageId)?.id === projectId)
    : units;
  const validate = (
    records: Record<string, string>[],
  ): RowCheck<PlanLine>[] => {
    let n = Number(nextCode("EP", planLines).split("-")[1]);
    return records.map((r) => {
      const type = bulk.pick(r.equipment_type ?? "", EQUIPMENT_TYPES);
      const where = projects.find(
        (p) => p.code.toUpperCase() === (r.code ?? "").toUpperCase(),
      );
      const value = {
        equipmentType: type ?? "",
        projectId: where?.id ?? "",
        plannedQty: bulk.num(r.units ?? ""),
        from: r.from ?? "",
        to: r.to ?? "",
        reason: r.purpose ?? "",
      };
      const errors = bulk.check(schema, value);
      if (!type)
        errors.push(
          `equipment_type must be one of: ${EQUIPMENT_TYPES.join(", ")}.`,
        );
      if (r.code && !where)
        errors.push(`Project code ${r.code} does not exist.`);
      if (value.from && !bulk.date(value.from))
        errors.push("from must be a date like 2027-01-01.");
      if (value.to && !bulk.date(value.to))
        errors.push("to must be a date like 2027-06-30.");
      if (
        planLines.some(
          (l) =>
            l.equipmentType === type &&
            l.projectId === where?.id &&
            l.from === value.from,
        )
      )
        errors.push("The same line already exists.");
      const label = `${type ?? r.equipment_type ?? "?"} × ${r.units || "?"} · ${r.code || "?"}`;
      return errors.length
        ? { label, errors }
        : { label, value: { ...value, id: `EP-${n++}` } };
    });
  };
  const [remove, setRemove] = useState<PlanLine | null>(null);
  const [reason, setReason] = useState("");
  const [reasonErr, setReasonErr] = useState("");
  const closeRemove = () => {
    setRemove(null);
    setReason("");
    setReasonErr("");
  };

  const registered = (l: PlanLine) =>
    units.filter(
      (u) =>
        u.type === l.equipmentType &&
        projectOf(projects, u.chainageId)?.id === l.projectId,
    ).length;
  const where = (l: PlanLine) =>
    projects.find((p) => p.id === l.projectId)?.name ?? l.projectId;
  const gapOf = (l: PlanLine) => registered(l) - l.plannedQty;
  const state = (l: PlanLine) =>
    gapOf(l) < 0 ? "Shortfall" : gapOf(l) > 0 ? "Surplus" : "Fulfilled";
  const gapText = (l: PlanLine) =>
    gapOf(l) > 0 ? `+${gapOf(l)}` : gapOf(l) < 0 ? `−${-gapOf(l)}` : "0";
  const gapTone = (l: PlanLine) =>
    gapOf(l) > 0 ? "approved" : gapOf(l) < 0 ? "rejected" : "pending";

  return (
    <div ref={ref}>
      <PageHead
        crumb="Project equipment planning"
        title="Project equipment planning"
        desc="Define the equipment required for each project. Onboarded units are tracked against these requirements."
        actions={
          <Can privilege={MANAGE.masters}>
            <Button icon="upload" onClick={() => setUpload(true)}>
              Bulk upload
            </Button>
            <Button tone="primary" icon="plus" onClick={() => setEdit("new")}>
              Add plan line
            </Button>
          </Can>
        }
      />
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">
          {(id) => (
            <Select
              id={id}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </FormGroup>
      </div>
      <div className="grid stats">
        <StatTile
          label="Planned units"
          value={rows.reduce((s, l) => s + l.plannedQty, 0)}
          icon="clipboard"
          tone="blue"
        />
        <StatTile
          label="Onboarded units"
          value={shownUnits.length}
          icon="truck"
          tone="green"
        />
        <StatTile
          label="shortfall"
          value={rows.filter((l) => gapOf(l) < 0).length}
          icon="trendDown"
          tone="rose"
        />
        <StatTile
          label="surplus"
          value={rows.filter((l) => gapOf(l) > 0).length}
          icon="trend"
          tone="gold"
        />
      </div>
      <TablePanel
        title="Plan lines"
        subtitle="Filter by state using the chips; pick more than one to combine. Each line compares the planned units with the units registered by P&M."
        rows={rows}
        rowKey={(l) => l.id}
        columns={[
          {
            header: "Type",
            kind: "c-id",
            cell: (l) => <strong>{l.equipmentType}</strong>,
            csv: (l) => l.equipmentType,
          },
          {
            header: "Needed at",
            kind: "c-sub",
            cell: (l) => (
              <>
                <strong>{where(l)}</strong>
                <span className="sub">Project · {l.reason}</span>
              </>
            ),
            csv: (l) => `Project: ${where(l)}`,
          },
          {
            header: "Registered / planned",
            kind: "c-amt",
            cell: (l) => `${registered(l)} / ${l.plannedQty}`,
            csv: (l) => `${registered(l)}/${l.plannedQty}`,
          },
          {
            header: "Time Period",
            kind: "c-more",
            cell: (l) => `${fmtDate(l.from)} – ${fmtDate(l.to)}`,
            csv: (l) => `${l.from} to ${l.to}`,
          },
          {
            header: "State",
            kind: "c-status",
            cell: (l) => (
              <StatusBadge tone={gapTone(l)}>{gapText(l)}</StatusBadge>
            ),
            csv: gapText,
          },
        ]}
        searchText={(l) => `${l.equipmentType} ${where(l)} ${l.reason}`}
        statusOf={state}
        action={(l) => (
          <Can privilege={MANAGE.masters}>
            <div className="row-actions">
              <Button size="sm" icon="pencil" onClick={() => setEdit(l)}>
                Edit
              </Button>
              <Button
                size="sm"
                tone="danger"
                icon="trash"
                onClick={() => setRemove(l)}
              >
                Remove
              </Button>
            </div>
          </Can>
        )}
        exportName="core-equipment-plan"
        chipNoun="states"
      />
      <BulkUpload
        open={upload}
        onOpenChange={setUpload}
        noun="plan lines"
        templateName="core-equipment-plan-template"
        fields={[
          {
            key: "equipment_type",
            label: "Equipment type",
            required: true,
            example: "Asphalt Paver",
            hint: EQUIPMENT_TYPES.join(", "),
          },
          {
            key: "code",
            label: "Project code",
            required: true,
            example: projects[0]?.code ?? "",
            hint: `Projects: ${projects.map((p) => p.code).join(", ")}`,
          },
          {
            key: "units",
            label: "Units needed",
            required: true,
            example: "2",
            hint: "Whole number, 1 or more",
          },
          {
            key: "from",
            label: "From",
            required: true,
            example: "2027-01-01",
            hint: "yyyy-mm-dd",
          },
          {
            key: "to",
            label: "To",
            required: true,
            example: "2027-06-30",
            hint: "yyyy-mm-dd, after from",
          },
          {
            key: "purpose",
            label: "What the units are for",
            required: true,
            example: "Bituminous surfacing km 0–20",
          },
        ]}
        validate={validate}
        onImport={(list) => void saveEach(list, (l) => saveEquipmentPlanRemote(l), (l) => `${l.equipmentType} × ${l.plannedQty}`, { one: "plan line", many: "plan lines" })}
      />
      <Modal
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit === "new" ? "Add plan line" : "Edit plan line"}
      >
        {edit && (
          <PlanForm
            key={edit === "new" ? "new" : edit.id}
            line={edit === "new" ? undefined : edit}
            defaultProjectId={projectId}
            onDone={() => setEdit(null)}
          />
        )}
      </Modal>
      <Modal
        open={!!remove}
        onOpenChange={(o) => !o && closeRemove()}
        title="Remove plan line?"
      >
        {remove && (
          <>
            <p style={{ marginTop: 0 }}>
              {remove.equipmentType} × {remove.plannedQty} at {where(remove)}.
              Extra-equipment requests will be checked without it. The change is
              kept in the audit trail.
            </p>
            <FormGroup label="Reason" required error={reasonErr}>
              {(id, d) => (
                <Textarea
                  rows={2}
                  {...a11y(id, d, reasonErr)}
                  value={reason}
                  onChange={(ev) => {
                    setReason(ev.target.value);
                    setReasonErr("");
                  }}
                />
              )}
            </FormGroup>
            <div className="form-actions">
              <Button onClick={closeRemove}>Cancel</Button>
              <Button
                tone="danger"
                onClick={() => {
                  if (reason.trim().length < 3)
                    return setReasonErr("Say why the line is being removed.");
                  const done = () => {
                    closeRemove();
                    notify("Plan line removed");
                  };
                  // the API cannot delete a plan line, so it is cancelled
                  cancelPlanRemote("equipment", remove.id).then(done, (err) => setReasonErr(errorText(err)));
                }}
              >
                Remove
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function PlanForm({
  line,
  defaultProjectId = "",
  onDone,
}: {
  line?: PlanLine;
  defaultProjectId?: string;
  onDone: () => void;
}) {
  const { projects, planSource, saveEquipmentPlanRemote, equipmentTypes } = useCore();
  // once the server's equipment types are read they are the only ones a line can use
  const typeNames = planSource === "api" && equipmentTypes.length ? equipmentTypes.filter((t) => t.active || t.name === line?.equipmentType).map((t) => t.name) : EQUIPMENT_TYPES;
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState<{ key: string; body: string } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors: e },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: line ?? {
      equipmentType: typeNames[0] ?? EQUIPMENT_TYPES[0],
      projectId: defaultProjectId,
      plannedQty: 1,
      from: "",
      to: "",
      reason: "",
    },
  });
  const submit = handleSubmit(async (v) => {
    setFormError("");
    const next = { ...v, id: line?.id ?? newId(), rowVersion: line?.rowVersion };
    const body = JSON.stringify(v);
    const key = pending?.body === body ? pending.key : idempotencyKey();
    setPending({ key, body });
    try {
      await saveEquipmentPlanRemote(next, key);
      setPending(null);
      notify(line ? "Plan line saved" : "Plan line added");
      onDone();
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== "NETWORK_ERROR") setPending(null);
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        await useCore.getState().loadPlanning();
        return setFormError("Someone else changed this line. The latest version is loaded; close this and edit it again.");
      }
      setFormError(errorText(err));
    }
  });
  return (
    <form noValidate onSubmit={submit}>
      {formError && (
        <div className="login-error" role="alert" style={{ marginBottom: 14 }}>
          <span>{formError}</span>
        </div>
      )}
      <div className="form-grid">
        <FormGroup label="Equipment type" required>
          {(id) => (
            <Select id={id} {...register("equipmentType")}>
              {typeNames.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Units needed" required error={e.plannedQty?.message}>
          {(id, d) => (
            <Input
              type="number"
              min={1}
              {...a11y(id, d, e.plannedQty?.message)}
              {...register("plannedQty", { valueAsNumber: true })}
            />
          )}
        </FormGroup>
        <FormGroup label="Project" required error={e.projectId?.message}>
          {(id, d) => (
            <Select
              {...a11y(id, d, e.projectId?.message)}
              {...register("projectId")}
            >
              <option value="">Choose…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="From" required error={e.from?.message}>
          {(id, d) => (
            <Input
              type="date"
              {...a11y(id, d, e.from?.message)}
              {...register("from")}
            />
          )}
        </FormGroup>
        <FormGroup label="To" required error={e.to?.message}>
          {(id, d) => (
            <Input
              type="date"
              {...a11y(id, d, e.to?.message)}
              {...register("to")}
            />
          )}
        </FormGroup>
        <FormGroup label="Purpose" required full error={e.reason?.message}>
          {(id, d) => (
            <Textarea
              rows={2}
              {...a11y(id, d, e.reason?.message)}
              {...register("reason")}
            />
          )}
        </FormGroup>
      </div>
      <div className="form-actions">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" tone="primary">
          Save plan line
        </Button>
      </div>
    </form>
  );
}
