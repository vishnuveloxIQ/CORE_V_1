import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { BulkUpload, type RowCheck } from "@/shared/ui/data/BulkUpload";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Button } from "@/shared/ui/Button";
import { PhoneField } from "@/shared/ui/PhoneField";
import { DEFAULT_COUNTRY } from "@/shared/lib/countryCodes";
import { FormGroup, Input, Select } from "@/shared/ui/Field";
import { Modal } from "@/shared/ui/Modal";
import { PageHead } from "@/modules/shell";
import { StatusBadge } from "@/shared/ui/Status";
import type { Store } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { bulk, saveEach } from "@/shared/lib/bulk";
import { a11y, ACTIVE_TONE, code, phone, req } from "@/shared/lib/core";
import { notify } from "@/shared/lib/toast";
import { Can, MANAGE, useCanManage } from '@/modules/auth';
import { nextCode, useCore } from "@/modules/core-data";
import { Note } from "@/shared/ui/Extras";
import { ApiError, errorText, fieldErrors, idempotencyKey } from "@/shared/lib/api";

const schema = z.object({
  code: code("Store registration code"),
  name: req("Store registration name"),
  projectId: z.string().min(1, "Choose the project."),
  location: req("Address"),
  keeper: req("Store incharge"),
  phone,
  status: z.enum(["Active", "Inactive"]),
});

/** 3.4 Stores master. */
export default function Stores() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "stores");
  const navigate = useNavigate();
  const { stores, projects, materials, projectsSource, storesLoad, storesError, loadStores, createStoreRemote } = useCore();
  const [edit, setEdit] = useState<Store | "new" | null>(null);
  // the project filter narrows the store registrations shown
  const [projectId, setProjectId] = useState("");
  const shownStores = projectId ? stores.filter((s) => s.projectId === projectId) : stores;
  const canManage = useCanManage(MANAGE.projects);
  const [upload, setUpload] = useState(false);
  /** Saves each row with POST /stores, one after the other, and reports any rows the server refused. */
  const importAll = async (list: Store[]) => {
    if (projectsSource !== "api")
      return notify("Projects were not read from the server, so no store registration was saved. Reload the page and try again.", 6000);
    // the API body is built from the store fields only, so the row can be passed as it is
    await saveEach(list, (row) => createStoreRemote(row), (row) => row.code, { one: "store registration", many: "store registrations" });
  };
  const validate = (records: Record<string, string>[]): RowCheck<Store>[] => {
    const dup = bulk.dupes(records.map((r) => r.code));
    let n = Number(nextCode("ST", stores).split("-")[1]);
    return records.map((r) => {
      const codeV = (r.code ?? "").toUpperCase();
      const project = projects.find((x) => x.code.toUpperCase() === (r.project_code ?? "").toUpperCase());
      const status = bulk.pick(r.status || "Active", [
        "Active",
        "Inactive",
      ] as const);
      const value = {
        code: codeV,
        name: r.name ?? "",
        projectId: project?.id ?? "",
        location: r.location ?? "",
        keeper: r.keeper ?? "",
        phone: r.phone ?? "",
        status: status ?? "Active",
      };
      const errors = bulk.check(schema, value);
      if (r.project_code && !project)
        errors.push(`Project ID ${r.project_code} is not a known project.`);
      if (!r.project_code) errors.push("project_code is required.");
      if (!status) errors.push("status must be Active or Inactive.");
      if (stores.some((x) => x.code === codeV))
        errors.push(`Store code ${codeV} already exists.`);
      else if (dup.has(codeV))
        errors.push(`Code ${codeV} appears twice in the file.`);
      const label = `${codeV || "?"} · ${r.name || "no name"}`;
      return errors.length
        ? { label, errors }
        : { label, value: { ...value, chainageId: "", id: `ST-${n++}` } };
    });
  };
  const projectOfStore = (s: Store) => projects.find((p) => p.id === s.projectId);
  const itemsIn = (id: string) =>
    materials.filter((m) => m.storeIds.includes(id)).length;
  return (
    <div ref={ref}>
      <PageHead
        crumb="Store registrations"
        title="Store registrations"
        desc="Store registration details and the project each store registration serves."
        actions={
          <>
            <Can privilege={MANAGE.projects}>
              <Button icon="upload" onClick={() => setUpload(true)}>
                Bulk upload
              </Button>
              <Button tone="primary" icon="plus" onClick={() => setEdit("new")}>
                New store
              </Button>
            </Can>
          </>
        }
      />
      {storesLoad === "error" && (
        <Note title="Store registrations could not be loaded from the server" icon="alert">
          {storesError}{" "}
          <Button size="sm" icon="refresh" onClick={() => void loadStores()}>
            Try again
          </Button>
        </Note>
      )}
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">
          {(id) => (
            <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}
        </FormGroup>
      </div>
      <TablePanel
        title="All store registrations"
        subtitle="Filter by status using the chips; pick more than one to combine. Search by code, name, incharge or address. Edit a store registration to change its incharge or location."
        rows={shownStores}
        rowKey={(s) => s.id}
        columns={[
          {
            header: "Code",
            kind: "c-id",
            cell: (s) => (
              <button
                type="button"
                className="id-link"
                onClick={canManage ? () => setEdit(s) : undefined}
              >
                {s.code}
              </button>
            ),
            csv: (s) => s.code,
          },
          {
            header: "Store",
            kind: "c-sub",
            cell: (s) => <strong>{s.name}</strong>,
            csv: (s) => s.name,
          },
          {
            header: "Project",
            kind: "c-more",
            cell: (s) => projectOfStore(s)?.name ?? "No project",
            csv: (s) => projectOfStore(s)?.name ?? "",
          },
          {
            header: "Materials",
            kind: "c-amt",
            cell: (s) => itemsIn(s.id),
            csv: (s) => String(itemsIn(s.id)),
          },
          {
            header: "Address",
            kind: "c-more",
            cell: (s) => s.location,
            csv: (s) => s.location,
          },
          {
            header: "Store incharge",
            kind: "c-more",
            cell: (s) => (
              <>
                {s.keeper}
                <span className="sub">{s.phone}</span>
              </>
            ),
            csv: (s) => s.keeper,
          },
          {
            header: "Status",
            kind: "c-status",
            cell: (s) => (
              <StatusBadge tone={ACTIVE_TONE(s.status)}>{s.status}</StatusBadge>
            ),
            csv: (s) => s.status,
          },
        ]}
        searchText={(s) => `${s.code} ${s.name} ${projectOfStore(s)?.name ?? ""} ${s.keeper} ${s.location}`}
        statusOf={(s) => s.status}
        action={(s) => (
          <div className="row-actions">
            <Button size="sm" onClick={() => navigate(`/stock?store=${s.id}`)}>
              Stock
            </Button>
            <Can privilege={MANAGE.projects}>
              <Button size="sm" icon="pencil" onClick={() => setEdit(s)}>
                Edit
              </Button>
            </Can>
          </div>
        )}
        exportName="core-stores"
      />
      <BulkUpload
        open={upload}
        onOpenChange={setUpload}
        noun="store registrations"
        templateName="core-stores-template"
        fields={[
          {
            key: "code",
            label: "Store registration code",
            required: true,
            example: "STR-E",
            hint: "Capitals, digits and hyphens",
          },
          {
            key: "name",
            label: "Store registration name",
            required: true,
            example: "Camp A fuel store",
          },
          {
            key: "project_code",
            label: "Project ID",
            required: true,
            example: projects[0]?.code ?? "",
            hint: `Projects: ${projects.map((x) => x.code).join(", ")}`,
          },
          {
            key: "location",
            label: "Address",
            required: true,
            example: "Camp A, near gate 2",
          },
          {
            key: "keeper",
            label: "Store Incharge",
            required: true,
            example: "Suresh Babu",
          },
          {
            key: "phone",
            label: "Store Incharge Mobile",
            required: true,
            example: "9844400011",
          },
          {
            key: "status",
            label: "Status (optional)",
            example: "Active",
            hint: "Active or Inactive",
          },
        ]}
        validate={validate}
        onImport={(list) => void importAll(list)}
      />
      <Modal
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit === "new" ? "New store registration" : "Edit store registration"}
      >
        {edit && (
          <StoreForm
            key={edit === "new" ? "new" : edit.id}
            store={edit === "new" ? undefined : edit}
            onDone={() => setEdit(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function StoreForm({ store, onDone }: { store?: Store; onDone: () => void }) {
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const { stores, projects, createStoreRemote, updateStoreRemote, loadStores } = useCore();
  const [formError, setFormError] = useState("");
  // one Idempotency-Key per action; only a retry of the same values after a lost connection reuses it
  const [pending, setPending] = useState<{ key: string; body: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors: e, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: store ? { code: store.code, name: store.name, projectId: store.projectId, location: store.location, keeper: store.keeper, phone: store.phone, status: store.status } : {
      code: "",
      name: "",
      projectId: "",
      location: "",
      keeper: "",
      phone: "",
      status: "Active" as const,
    },
  });
  const submit = handleSubmit(async (v) => {
    setFormError("");
    if (stores.some((s) => s.code === v.code && s.id !== store?.id))
      return setError("code", { message: "Another store registration uses this code." });
    const details = { ...v, chainageId: "" };
    const body = JSON.stringify(v);
    const key = pending?.body === body ? pending.key : idempotencyKey();
    setPending({ key, body });
    try {
      if (store) await updateStoreRemote(store.id, details, key);
      else await createStoreRemote(details, key);
      setPending(null);
      notify(store ? "Store registration saved" : "Store registration created");
      onDone();
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== "NETWORK_ERROR") setPending(null);
      if (err instanceof ApiError && err.code.endsWith("_DUPLICATE"))
        return setError("code", { message: "Another store registration uses this code." });
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        await loadStores();
        return setFormError("Someone else changed this store registration. The latest version is loaded; close this and edit it again.");
      }
      const api2form: Record<string, keyof typeof v> = { locationText: "location" };
      const fields = Object.entries(fieldErrors(err)).filter(([k]) => k in api2form || k in v);
      fields.forEach(([k, m]) => setError(api2form[k] ?? (k as keyof typeof v), { message: m }));
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
        <FormGroup label="Store registration name" required error={e.name?.message}>
          {(id, d) => (
            <Input {...a11y(id, d, e.name?.message)} {...register("name")} />
          )}
        </FormGroup>
        <FormGroup label="Store registration code" required error={e.code?.message}>
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
        <FormGroup label="Project" required error={e.projectId?.message}>
          {(id, d) => (
            <Select {...a11y(id, d, e.projectId?.message)} {...register("projectId")}>
              <option value="">Choose…</option>
              {projects.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.code})
                </option>
              ))}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Address" required error={e.location?.message}>
          {(id, d) => (
            <Input
              placeholder="Enter shed, yard or gate"
              {...a11y(id, d, e.location?.message)}
              {...register("location")}
            />
          )}
        </FormGroup>
        <FormGroup label="Store incharge" required error={e.keeper?.message}>
          {(id, d) => (
            <Input
              {...a11y(id, d, e.keeper?.message)}
              {...register("keeper")}
            />
          )}
        </FormGroup>
        <FormGroup
          label="Store incharge mobile"
          required
          error={e.phone?.message}
        >
          {(id, d) => (
            <PhoneField
              country={country}
              onCountry={setCountry}
              placeholder="Enter mobile number"
              {...a11y(id, d, e.phone?.message)}
              {...register("phone")}
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
      </div>
      <div className="form-actions">
        <Button onClick={onDone} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" tone="primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : store ? "Save store registration" : "Create store registration"}
        </Button>
      </div>
    </form>
  );
}
