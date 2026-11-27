import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { z } from "zod";
import { BulkUpload, type RowCheck } from "@/shared/ui/data/BulkUpload";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Button } from "@/shared/ui/Button";
import { FormGroup, Input, Select, Textarea } from "@/shared/ui/Field";
import { Modal } from "@/shared/ui/Modal";
import { EquipmentRateTable } from "@/modules/company";
import { PageHead } from "@/modules/shell";
import { StatTile } from "@/shared/ui/StatTile";
import { CAPACITY_OPTIONS, COMPANY_EQUIPMENT_TYPE, EQUIPMENT_TYPES, PLAN_EQUIPMENT_TYPES } from "@/modules/core-data";
import type { PlanLine } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { bulk, saveEach } from "@/shared/lib/bulk";
import { a11y, num, req } from "@/shared/lib/core";
import { fmtDate } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { newId, nextCode, useCore } from "@/modules/core-data";
import { ApiError, errorText, idempotencyKey } from "@/shared/lib/api";
import { Can, MANAGE } from '@/modules/auth';

const schema = z
  .object({
    equipmentType: req("Equipment type"),
    projectId: z.string().min(1, "Choose the project."),
    plannedQty: num("Quantity", 1).int("Whole units only."),
    // the capacity and model the line needs: optional (API 1.9.0)
    capacity: z.string().trim().max(100, "Keep it under 100 characters.").optional(),
    model: z.string().trim().max(100, "Keep it under 100 characters.").optional(),
    from: z.string().min(1, "Pick a start date."),
    reason: z.string().trim().refine((v) => v === "" || v.length >= 3, "Say what the units are for, or leave it empty."),
  });

/** 3.5 Equipment planning: CORE decides units needed per type per site or project. */
export default function EquipmentPlanning() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "eq-planning");
  const { planLines, projects, units, saveEquipmentPlanRemote, cancelPlanRemote } = useCore();
  const [edit, setEdit] = useState<PlanLine | "new" | null>(null);
  const [upload, setUpload] = useState(false);
  const [projectId, setProjectId] = useState("");
  const rows = projectId
    ? planLines.filter((l) => l.projectId === projectId)
    : planLines;
  // one row per project and equipment type, with the units added up
  const groups: PlanGroup[] = [];
  for (const l of rows) {
    const key = [l.projectId, l.equipmentType].map((x) => x.trim().toLowerCase()).join("|");
    const g = groups.find((x) => x.key === key);
    if (g) g.lines.push(l);
    else groups.push({ key, lines: [l] });
  }
  const [manage, setManage] = useState<string | null>(null);
  const managed = groups.find((g) => g.key === manage);
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
        to: "",
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

  const where = (l: PlanLine) =>
    projects.find((p) => p.id === l.projectId)?.name ?? l.projectId;
  const totalOf = (g: PlanGroup) => g.lines.reduce((n, l) => n + l.plannedQty, 0);
  // units assigned to this row's project and type (they are In use at the project)
  const assignedOf = (g: PlanGroup) => {
    const { projectId: pid, equipmentType } = g.lines[0]!;
    return units.filter((u) => u.projectId === pid && u.type.trim().toLowerCase() === equipmentType.trim().toLowerCase() && u.availability === "In use").length;
  };
  // why units were assigned beyond the plan: the reasons given on this row's project and type
  const overReasons = (g: PlanGroup) => {
    const { projectId: pid, equipmentType } = g.lines[0]!;
    const found = units.filter((u) => u.projectId === pid && u.type.trim().toLowerCase() === equipmentType.trim().toLowerCase() && u.overPlanReason);
    return found.map((u) => `${u.assetCode}: ${u.overPlanReason}`).join("; ");
  };
  const earliest = (g: PlanGroup) => g.lines.map((l) => l.from).filter(Boolean).sort()[0] ?? "";
  const distinct = (g: PlanGroup, pick: (l: PlanLine) => string | undefined) =>
    Array.from(new Set(g.lines.map((l) => pick(l)?.trim()).filter(Boolean))).join(", ");
  const purposes = (g: PlanGroup) => Array.from(new Set(g.lines.map((l) => l.reason).filter(Boolean))).join("; ");

  return (
    <div ref={ref}>
      <PageHead
        crumb="Project equipment planning"
        title="Project equipment planning"
        desc="The equipment each project needs: type, capacity or size, model and the number of units planned."
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
          value={rows.reduce((n, l) => n + l.plannedQty, 0)}
          icon="clipboard"
          tone="blue"
        />
        <StatTile
          label="Equipment types"
          value={new Set(rows.map((l) => l.equipmentType)).size}
          icon="layers"
          tone="green"
        />
        <StatTile
          label="Projects planned"
          value={new Set(rows.map((l) => l.projectId)).size}
          icon="clipboard"
          tone="gold"
        />
      </div>
      <TablePanel
        title="Equipment planned"
        subtitle="The equipment planned for each project. Lines for the same equipment type are added together."
        rows={groups}
        rowKey={(g) => g.key}
        columns={[
          {
            header: "Type",
            kind: "c-id",
            cell: (g) => <strong>{g.lines[0]!.equipmentType}</strong>,
            csv: (g) => g.lines[0]!.equipmentType,
          },
          {
            header: "Required at",
            kind: "c-sub",
            cell: (g) => (
              <>
                <strong>{where(g.lines[0]!)}</strong>
                <span className="sub">{purposes(g)}</span>
              </>
            ),
            csv: (g) => where(g.lines[0]!),
          },
          {
            header: "Capacity / size",
            kind: "c-more",
            cell: (g) => distinct(g, (l) => l.capacity) || "—",
            csv: (g) => distinct(g, (l) => l.capacity),
          },
          {
            header: "Model",
            kind: "c-more",
            cell: (g) => distinct(g, (l) => l.model) || "—",
            csv: (g) => distinct(g, (l) => l.model),
          },
          {
            header: "Units planned",
            kind: "c-amt",
            cell: (g) => totalOf(g),
            csv: (g) => String(totalOf(g)),
          },
          {
            header: "Assigned",
            kind: "c-amt",
            cell: (g) => assignedOf(g),
            csv: (g) => String(assignedOf(g)),
          },
          {
            header: "Over-plan reason",
            kind: "c-more",
            cell: (g) => overReasons(g) || "—",
            csv: (g) => overReasons(g),
          },
          {
            header: "Required from",
            kind: "c-more",
            cell: (g) => fmtDate(earliest(g)),
            csv: (g) => earliest(g),
          },
        ]}
        searchText={(g) => `${g.lines[0]!.equipmentType} ${where(g.lines[0]!)} ${distinct(g, (l) => l.capacity)} ${distinct(g, (l) => l.model)} ${purposes(g)}`}
        action={(g) => (
          <Can privilege={MANAGE.masters}>
            <div className="row-actions">
              {g.lines.length === 1 ? (
                <>
                  <Button size="sm" icon="pencil" onClick={() => setEdit(g.lines[0]!)}>
                    Edit
                  </Button>
                  <Button size="sm" tone="danger" icon="trash" onClick={() => setRemove(g.lines[0]!)}>
                    Remove
                  </Button>
                </>
              ) : (
                <Button size="sm" icon="pencil" onClick={() => setManage(g.key)}>
                  Manage {g.lines.length} lines
                </Button>
              )}
            </div>
          </Can>
        )}
        exportName="core-equipment-plan"
      />
      <div style={{ marginTop: 18 }}>
        <EquipmentRateTable projectId={projectId} />
      </div>
      <Modal
        open={!!managed}
        onOpenChange={(o) => !o && setManage(null)}
        title="Planned lines"
        description={managed ? `${managed.lines[0]!.equipmentType} at ${where(managed.lines[0]!)}: ${totalOf(managed)} units in ${managed.lines.length} lines.` : undefined}
      >
        {managed && (
          <>
            {managed.lines.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line, #e5e7eb)" }}>
                <div>
                  <strong>{l.plannedQty} {l.plannedQty === 1 ? "unit" : "units"}</strong>
                  {[l.capacity, l.model].filter(Boolean).length > 0 && <> · {[l.capacity, l.model].filter(Boolean).join(" · ")}</>}
                  {" "}· from {fmtDate(l.from)}
                  <div className="helper">{l.reason}</div>
                </div>
                <div className="row-actions">
                  <Button size="sm" icon="pencil" onClick={() => { setManage(null); setEdit(l); }}>
                    Edit
                  </Button>
                  <Button size="sm" tone="danger" icon="trash" onClick={() => { setManage(null); setRemove(l); }}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            <div className="form-actions">
              <Button onClick={() => setManage(null)}>Close</Button>
            </div>
          </>
        )}
      </Modal>
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
            key: "purpose",
            label: "What the units are for",
            required: false,
            example: "Bituminous surfacing",
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

interface PlanGroup {
  key: string;
  lines: PlanLine[];
}

/** The equipment type list's last choice: the planner types a type the company has not used before. */
const OTHER_TYPE = "__other__";

export function PlanForm({
  line,
  defaultProjectId = "",
  lockProject = false,
  onDone,
}: {
  line?: PlanLine;
  defaultProjectId?: string;
  /** true when opened from a project: the project is fixed to it */
  lockProject?: boolean;
  onDone: () => void;
}) {
  const { projects, planSource, saveEquipmentPlanRemote, equipmentTypes } = useCore();
  // the standard types first, then any other type already on the server; "Other" names one the company has not used yet
  const typeNames = Array.from(
    new Set<string>([
      ...PLAN_EQUIPMENT_TYPES,
      ...(planSource === "api"
        ? equipmentTypes.filter((t) => t.code !== COMPANY_EQUIPMENT_TYPE.code && (t.active || t.name === line?.equipmentType)).map((t) => t.name)
        : EQUIPMENT_TYPES),
    ]),
  );
  const startType = line?.equipmentType ?? typeNames[0] ?? "";
  const startsCustom = !typeNames.includes(startType);
  const [otherType, setOtherType] = useState(startsCustom ? startType : "");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState<{ key: string; body: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors: e },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: line ? { ...line, equipmentType: startsCustom ? OTHER_TYPE : line.equipmentType } : {
      equipmentType: typeNames[0] ?? EQUIPMENT_TYPES[0],
      projectId: defaultProjectId,
      plannedQty: 1,
      from: "",
      reason: "",
    },
  });
  const chosenType = watch("equipmentType");
  const typeName = chosenType === OTHER_TYPE ? otherType.trim() : chosenType;
  const capacityHints = CAPACITY_OPTIONS[typeName] ?? [];
  const submit = handleSubmit(async (v) => {
    setFormError("");
    if (v.equipmentType === OTHER_TYPE && !typeName) return setError("equipmentType", { message: "Name the equipment type." });
    const next = { ...v, to: "", equipmentType: typeName, id: line?.id ?? newId(), rowVersion: line?.rowVersion };
    const body = JSON.stringify({ ...v, equipmentType: typeName });
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
        <FormGroup label="Equipment type" required error={e.equipmentType?.message}>
          {(id) => (
            <Select id={id} {...register("equipmentType")}>
              {typeNames.map((t) => (
                <option key={t}>{t}</option>
              ))}
              <option value={OTHER_TYPE}>+ Add an equipment type not in the list</option>
            </Select>
          )}
        </FormGroup>
        {chosenType === OTHER_TYPE && (
          <FormGroup label="Other equipment type" required>
            {(id) => (
              <Input id={id} value={otherType} onChange={(ev) => setOtherType(ev.target.value)} placeholder="e.g. Crawler crane" />
            )}
          </FormGroup>
        )}
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
        <FormGroup label="Capacity / size" error={e.capacity?.message} helper={capacityHints.length ? "Pick a suggestion or type your own." : "Type the capacity or size you need."}>
          {(id, d) => (
            <>
              <Input
                list={`${id}-options`}
                placeholder={capacityHints[0] ? `e.g. ${capacityHints[0]}` : "e.g. 30-ton"}
                {...a11y(id, d, e.capacity?.message)}
                {...register("capacity", { setValueAs: (v: string) => v?.trim() || undefined })}
              />
              <datalist id={`${id}-options`}>
                {capacityHints.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </FormGroup>
        <FormGroup label="Model" error={e.model?.message}>
          {(id, d) => (
            <Input
              placeholder="e.g. EX200"
              {...a11y(id, d, e.model?.message)}
              {...register("model", { setValueAs: (v: string) => v.trim() || undefined })}
            />
          )}
        </FormGroup>
        {lockProject ? (
          <FormGroup label="Project" full>
            {(id) => (
              <>
                <Input id={id} value={projects.find((p) => p.id === defaultProjectId)?.name ?? ""} readOnly />
                <input type="hidden" {...register("projectId")} />
              </>
            )}
          </FormGroup>
        ) : (
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
        )}
        <FormGroup label="Needed from" required error={e.from?.message}>
          {(id, d) => (
            <Input
              type="date"
              {...a11y(id, d, e.from?.message)}
              {...register("from")}
            />
          )}
        </FormGroup>
        <FormGroup label="Purpose" full error={e.reason?.message}>
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
