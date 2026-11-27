import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { z } from "zod";
import { BulkUpload, type RowCheck } from "@/shared/ui/data/BulkUpload";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Button } from "@/shared/ui/Button";
import { Note } from "@/shared/ui/Extras";
import { CheckRow, FormGroup, Input, Select } from "@/shared/ui/Field";
import { Modal } from "@/shared/ui/Modal";
import { PageHead } from "@/modules/shell";
import { StatTile } from "@/shared/ui/StatTile";
import { StatusBadge } from "@/shared/ui/Status";
import type { Material, UomRecord } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { bulk, saveEach } from "@/shared/lib/bulk";
import { a11y, ACTIVE_TONE, code, num, req } from "@/shared/lib/core";
import { notify } from "@/shared/lib/toast";
import { Can, MANAGE, useCanManage } from '@/modules/auth';
import { createUom, newId, nextCode, uomLabel, useCore } from "@/modules/core-data";
import { ApiError, errorText, fieldErrors, idempotencyKey } from "@/shared/lib/api";

const CATEGORIES = [
  "Cement",
  "Steel",
  "Aggregates",
  "Sand",
  "Bitumen",
  "Fuel",
  "Admixtures",
  "Formwork",
  "Electrical",
  "Plumbing",
  "Safety",
  "Consumables",
  "Paint",
  "Other",
];
/** The unit each category is measured in. A category listed here has its unit fixed by the category. */
const CATEGORY_UNIT: Partial<Record<string, string>> = {
  Cement: "Bag (50 kg)",
  Steel: "MT",
  Aggregates: "Cum",
  Sand: "Cum",
  Bitumen: "MT",
  Fuel: "LTR",
  Admixtures: "LTR",
  Formwork: "NOS",
  Electrical: "NOS",
  Plumbing: "NOS",
  Safety: "NOS",
  Consumables: "NOS",
  Paint: "LTR",
};

/** Units of measure come from GET /uoms (read only); a unit the server does not list cannot be picked. */
const UOM_HELP =
  "";
/** The server unit written as `raw` (its code or name, ignoring case), as its code. */
const uomCodeFor = (uoms: UomRecord[], raw: string) => {
  const t = raw.trim().toLowerCase();
  return (uoms.find((u) => u.code.toLowerCase() === t) ?? uoms.find((u) => u.name.toLowerCase() === t))?.code;
};

const schema = z.object({
  code: code("Material code"),
  name: req("Material name"),
  category: req("Category"),
  uom: req("Unit of measure"),
  hsn: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "HSN is 4 to 8 digits."),
  reorderLevel: num("Reorder level", 0),
  storeIds: z
    .array(z.string())
    .min(1, "Make it available to at least one store."),
  status: z.enum(["Active", "Inactive"]),
});

/** 3.4 Material masters: owned by Stores, created in CORE, made available to each store. */
export default function Materials() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "materials");
  const { materials, stores, stock, uoms, saveMaterialRemote } = useCore();
  // a material belongs to a project when it is available in a store that serves that project
  const [projectId, setProjectId] = useState("");
  const shownMaterials = projectId
    ? materials.filter((m) => m.storeIds.some((id) => stores.find((s) => s.id === id)?.projectId === projectId))
    : materials;
  const [edit, setEdit] = useState<Material | "new" | null>(null);
  const canManage = useCanManage(MANAGE.masters);
  const [upload, setUpload] = useState(false);
  const usedMaterials = new Set(
    stock.filter((r) => r.qty > 0).map((r) => r.materialId),
  );

  const validate = (
    records: Record<string, string>[],
  ): RowCheck<Material>[] => {
    const dup = bulk.dupes(records.map((r) => r.code));
    let n = Number(nextCode("M", materials).split("-")[1]);
    return records.map((r) => {
      const codeV = (r.code ?? "").toUpperCase();
      const category = bulk.pick(r.category ?? "", CATEGORIES);
      const uom = uomCodeFor(uoms, r.uom ?? "");
      const storeCodes = bulk.split(r.store_codes ?? "");
      const storeIds = storeCodes.map(
        (c) => stores.find((s) => s.code.toUpperCase() === c.toUpperCase())?.id,
      );
      const status = bulk.pick(r.status || "Active", [
        "Active",
        "Inactive",
      ] as const);
      const value = {
        code: codeV,
        name: r.name ?? "",
        category: category ?? "",
        uom: uom ?? "",
        hsn: r.hsn ?? "",
        reorderLevel: bulk.num(r.reorder_level ?? ""),
        storeIds: storeIds.filter(Boolean) as string[],
        status: status ?? "Active",
      };
      const errors = bulk.check(schema, value);
      if (!category)
        errors.push(`category must be one of: ${CATEGORIES.join(", ")}.`);
      if (!uom)
        errors.push(
          uoms.length
            ? `uom must be one of the server's units: ${uoms.map((u) => u.code).join(", ")}.`
            : "uom cannot be checked: the server's units of measure are not loaded.",
        );
      if (storeIds.some((x) => !x))
        errors.push(
          `Unknown store code in "${r.store_codes}". Use ${stores.map((s) => s.code).join(", ")}.`,
        );
      if (!status) errors.push("status must be Active or Inactive.");
      if (materials.some((m) => m.code === codeV))
        errors.push(`Material code ${codeV} already exists.`);
      else if (dup.has(codeV))
        errors.push(`Code ${codeV} appears twice in the file.`);
      const label = `${codeV || "?"} · ${r.name || "no name"}`;
      return errors.length
        ? { label, errors }
        : { label, value: { ...value, id: `M-${n++}` } };
    });
  };
  return (
    <div ref={ref}>
      <PageHead
        crumb="Materials"
        title="Material masters"
        desc="Maintain the material master owned by Stores, and control which stores each material is available in."
        actions={
          <>
            <Can privilege={MANAGE.masters}>
              <Button icon="upload" onClick={() => setUpload(true)}>
                Bulk upload
              </Button>
              <Button tone="primary" icon="plus" onClick={() => setEdit("new")}>
                New material
              </Button>
            </Can>
          </>
        }
      />
      <div className="grid stats">
        <StatTile
          label="Material masters"
          value={materials.length}
          icon="package"
          tone="blue"
        />
        <StatTile
          label="Categories"
          value={new Set(materials.map((m) => m.category)).size}
          icon="tags"
          tone="purple"
        />
        <StatTile
          label="Available Stock"
          value={materials.filter((m) => usedMaterials.has(m.id)).length}
          icon="boxes"
          tone="green"
        />
        <StatTile
          label="Inactive materials"
          value={materials.filter((m) => m.status === "Inactive").length}
          icon="ban"
          tone="rose"
        />
      </div>
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">
          {(id) => (
            <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {useCore.getState().projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}
        </FormGroup>
      </div>
      <TablePanel
        title="All materials"
        subtitle="Filter by status using the chips; pick more than one to combine. Search by material code, name, category or HSN."
        rows={shownMaterials}
        rowKey={(m) => m.id}
        chipNoun="statuses"
        columns={[
          {
            header: "Code",
            kind: "c-id",
            cell: (m) => (
              <button
                type="button"
                className="id-link"
                onClick={canManage ? () => setEdit(m) : undefined}
              >
                {m.code}
              </button>
            ),
            csv: (m) => m.code,
          },
          {
            header: "Material / unit",
            kind: "c-sub",
            cell: (m) => (
              <>
                <strong>{m.name}</strong>
                <span className="sub">
                  {m.uom} · HSN {m.hsn}
                </span>
              </>
            ),
            csv: (m) => `${m.name} (${m.uom})`,
          },
          {
            header: "Stores",
            kind: "c-amt",
            cell: (m) => `${m.storeIds.length} of ${stores.length}`,
            csv: (m) => String(m.storeIds.length),
          },
          {
            header: "Category",
            kind: "c-more",
            cell: (m) => <span className="cell-pill">{m.category}</span>,
            csv: (m) => m.category,
          },
          {
            header: "Reorder level",
            kind: "c-more",
            cell: (m) => m.reorderLevel.toLocaleString("en-IN"),
            csv: (m) => String(m.reorderLevel),
          },
          {
            header: "Status",
            kind: "c-status",
            cell: (m) => (
              <StatusBadge tone={ACTIVE_TONE(m.status)}>{m.status}</StatusBadge>
            ),
            csv: (m) => m.status,
          },
        ]}
        searchText={(m) => `${m.code} ${m.name} ${m.category} ${m.hsn}`}
        statusOf={(m) => m.status}
        action={(m) => (
          <Can privilege={MANAGE.masters}>
            <Button size="sm" icon="pencil" onClick={() => setEdit(m)}>
              Edit
            </Button>
          </Can>
        )}
        searchPlaceholder="Search by code, name or HSN…"
        exportName="core-materials"
      />
      <BulkUpload
        open={upload}
        onOpenChange={setUpload}
        noun="materials"
        templateName="core-materials-template"
        fields={[
          {
            key: "code",
            label: "Material code",
            required: true,
            example: "CEM-OPC43",
            hint: "Capitals, digits and hyphens",
          },
          {
            key: "name",
            label: "Material name",
            required: true,
            example: "Cement OPC 43 grade",
          },
          {
            key: "category",
            label: "Category",
            required: true,
            example: "Cement",
            hint: CATEGORIES.join(", "),
          },
          {
            key: "uom",
            label: "Unit of measure",
            required: true,
            example: "Bag (50 kg)",
            hint: uoms.length ? uoms.map((u) => u.code).join(", ") : "Server units are not loaded",
          },
          {
            key: "hsn",
            label: "HSN code",
            required: true,
            example: "2523",
            hint: "4 to 8 digits",
          },
          {
            key: "reorder_level",
            label: "Reorder level",
            required: true,
            example: "200",
          },
          {
            key: "store_codes",
            label: "Stores it is available in",
            required: true,
            example: "STR-A; STR-B",
            hint: stores.map((s) => s.code).join(", "),
          },
          {
            key: "status",
            label: "Status (optional)",
            example: "Active",
            hint: "Active or Inactive",
          },
        ]}
        examples={[
          [
            "STL-TMT20",
            "TMT bar Fe 500D 20 mm",
            "Steel",
            "MT",
            "7214",
            "10",
            "STR-A; STR-D",
            "Active",
          ],
        ]}
        validate={validate}
        onImport={(list) => void saveEach(list, (m) => saveMaterialRemote(m), (m) => m.code, { one: "material", many: "materials" })}
      />
      <Modal
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit === "new" ? "New material" : "Edit material"}
      >
        {edit && (
          <MaterialForm
            key={edit === "new" ? "new" : edit.id}
            material={edit === "new" ? undefined : edit}
            onDone={() => setEdit(null)}
          />
        )}
      </Modal>
    </div>
  );
}

export function MaterialForm({
  material,
  onDone,
  onSaved,
}: {
  material?: Material;
  onDone: () => void;
  /** called with the saved material, so a form that opened this one can select it */
  onSaved?: (m: Material) => void;
}) {
  const { materials, stores, uoms, uomsError, saveMaterialRemote, loadUoms } = useCore();
  const [formError, setFormError] = useState("");
  // a unit typed for a category with no fixed unit: added to the shared unit list, then selected
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnit, setNewUnit] = useState({ code: "", name: "" });
  const [unitError, setUnitError] = useState("");
  const [savingUnit, setSavingUnit] = useState(false);
  const addUnit = async () => {
    const code = newUnit.code.trim();
    const name = newUnit.name.trim();
    if (!code || !name) return setUnitError("Enter the unit code and its name.");
    setSavingUnit(true);
    setUnitError("");
    try {
      const made = await createUom(code, name, idempotencyKey());
      await loadUoms();
      setValue("uom", made.code, { shouldValidate: true });
      setAddingUnit(false);
      setNewUnit({ code: "", name: "" });
    } catch (err) {
      setUnitError(err instanceof ApiError && err.code === "CONFLICT" ? "A unit with this code already exists. Pick it from the list." : errorText(err));
    } finally {
      setSavingUnit(false);
    }
  };
  // one Idempotency-Key per action; only a retry of the same values after a lost connection reuses it
  const [pending, setPending] = useState<{ key: string; body: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors: e },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: material ?? {
      code: "",
      name: "",
      category: "Cement",
      uom: uoms[0]?.code ?? "",
      hsn: "",
      reorderLevel: 0,
      storeIds: [],
      status: "Active" as const,
    },
  });
  // the category decides the unit when it has a fixed one; the unit is then set from it and shown read-only
  const category = watch("category");
  const fixedUnit = CATEGORY_UNIT[category];
  const fixedCode = fixedUnit ? uoms.find((u) => u.code === fixedUnit || u.name === fixedUnit)?.code : undefined;
  useEffect(() => {
    if (fixedCode) setValue("uom", fixedCode, { shouldValidate: true });
  }, [fixedCode, setValue]);
  const submit = handleSubmit(async (v) => {
    setFormError("");
    if (materials.some((m) => m.code === v.code && m.id !== material?.id))
      return setError("code", { message: "Another material uses this code." });
    const next = { ...material, ...v, id: material?.id ?? newId() };
    const body = JSON.stringify(v);
    const key = pending?.body === body ? pending.key : idempotencyKey();
    setPending({ key, body });
    try {
      const saved = await saveMaterialRemote(next, key);
      setPending(null);
      notify(material ? "Material saved" : "Material created");
      onSaved?.(saved);
      onDone();
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== "NETWORK_ERROR") setPending(null);
      if (err instanceof ApiError && err.code.endsWith("_DUPLICATE"))
        return setError("code", { message: "Another material uses this code." });
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        await useCore.getState().loadMaterials();
        return setFormError("Someone else changed this material. The latest version is loaded; close this and edit it again.");
      }
      const fields = Object.entries(fieldErrors(err)).filter(([k]) => k in v);
      fields.forEach(([k, m]) => setError(k as keyof typeof v, { message: m }));
      setFormError(fields.length ? "Check the highlighted fields." : errorText(err));
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
        <FormGroup label="Material name" required full error={e.name?.message}>
          {(id, d) => (
            <Input {...a11y(id, d, e.name?.message)} {...register("name")} />
          )}
        </FormGroup>
        <FormGroup label="Material code" required error={e.code?.message}>
          {(id, d) => (
            <Input
              className="uppercase"
              {...a11y(id, d, e.code?.message)}
              {...register("code", {
                setValueAs: (v: string) => v.toUpperCase(),
              })}
            />
          )}
        </FormGroup>
        <FormGroup label="HSN code" required error={e.hsn?.message}>
          {(id, d) => (
            <Input
              inputMode="numeric"
              maxLength={8}
              {...a11y(id, d, e.hsn?.message)}
              {...register("hsn")}
            />
          )}
        </FormGroup>
        <FormGroup label="Category" required>
          {(id) => (
            <Select id={id} {...register("category")}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </FormGroup>
        <FormGroup
          label="Unit of measure"
          required
          error={e.uom?.message}
          helper={uomsError ? `The server's units could not be read: ${uomsError}` : UOM_HELP}
        >
          {(id, d) => fixedCode ? (
            <>
              <Input id={id} value={uomLabel(uoms.find((u) => u.code === fixedCode)!)} readOnly aria-describedby={d} />
              <input type="hidden" {...register("uom")} />
            </>
          ) : (
            <Select id={id} {...register("uom", { onChange: (ev) => { if (ev.target.value === "__new__") { setValue("uom", ""); setAddingUnit(true) } } })}>
              <option value="">Choose a unit</option>
              {uoms.map((u) => (
                <option key={u.id} value={u.code}>{uomLabel(u)}</option>
              ))}
              <option value="__new__">+ Add a unit not in the list</option>
            </Select>
          )}
        </FormGroup>
        <FormGroup
          label="Reorder level"
          required
          error={e.reorderLevel?.message}
          helper="Live stock flags stores below this."
        >
          {(id, d) => (
            <Input
              type="number"
              {...a11y(id, d, e.reorderLevel?.message)}
              {...register("reorderLevel", { valueAsNumber: true })}
            />
          )}
        </FormGroup>
        <FormGroup label="Status">
          {(id) => (
            <Select id={id} {...register("status")}>
              <option>Active</option>
              <option>Inactive</option>
            </Select>
          )}
        </FormGroup>
        <fieldset
          className="form-group full"
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <legend style={{ fontSize: 13, fontWeight: 650, marginBottom: 8 }}>
            Available in stores <span className="required">*</span>
          </legend>
          <div className="check-grid">
            {stores.map((s) => (
              <CheckRow
                key={s.id}
                label={s.name}
                value={s.id}
                {...register("storeIds")}
              />
            ))}
          </div>
          {e.storeIds?.message && (
            <span
              className="helper"
              role="alert"
              style={{ color: "var(--red)" }}
            >
              {e.storeIds.message}
            </span>
          )}
        </fieldset>
      </div>
      <Note title="Owned by Stores" icon="info">
        Stores module reads this master and cannot edit it.
      </Note>
      <Modal open={addingUnit} onOpenChange={(o) => { if (!o && !savingUnit) setAddingUnit(false) }} title="Add a unit of measure" description="The unit is added to the company's unit list and selected for this material.">
        <div className="form-grid">
          <FormGroup label="Unit code" required>{(id) => <Input id={id} value={newUnit.code} placeholder="e.g. PKT" onChange={(ev) => setNewUnit({ ...newUnit, code: ev.target.value })} />}</FormGroup>
          <FormGroup label="Unit name" required>{(id) => <Input id={id} value={newUnit.name} placeholder="e.g. Packet" onChange={(ev) => setNewUnit({ ...newUnit, name: ev.target.value })} />}</FormGroup>
        </div>
        {unitError && <div className="login-error" role="alert" style={{ marginTop: 12 }}><span>{unitError}</span></div>}
        <div className="form-actions">
          <Button onClick={() => setAddingUnit(false)} disabled={savingUnit}>Cancel</Button>
          <Button tone="primary" onClick={() => void addUnit()} disabled={savingUnit}>{savingUnit ? "Adding…" : "Add unit"}</Button>
        </div>
      </Modal>
      <div className="form-actions">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" tone="primary">
          {material ? "Save material" : "Create material"}
        </Button>
      </div>
    </form>
  );
}
