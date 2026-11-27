import { useEffect, useRef, useState } from "react";
import { Can, MANAGE, useCanManage } from '@/modules/auth';
import { useNavigate } from "react-router-dom";
import { BulkUpload, type RowCheck } from "@/shared/ui/data/BulkUpload";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { PageHead } from "@/modules/shell";
import { StatTile } from "@/shared/ui/StatTile";
import { StatusBadge } from "@/shared/ui/Status";
import type { Department } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { bulk, saveEach } from "@/shared/lib/bulk";
import { ACTIVE_TONE, byId } from "@/shared/lib/core";
import { newId, useCore } from "@/modules/core-data";
import { DepartmentForm } from "../components/DepartmentForm";
import { DEPT_COLORS, deptColor, deptSchema } from "../utils/org";

/** Organisation › Departments: list, create, edit, bulk upload. */
export default function Departments() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "departments");
  const navigate = useNavigate();
  const { departments, roles, saveDepartmentRemote, loadOrganisation } = useCore();
  useEffect(() => { void loadOrganisation(); }, [loadOrganisation]);
  const [edit, setEdit] = useState<Department | "new" | null>(null);
  const canManage = useCanManage(MANAGE.organisation);
  const [upload, setUpload] = useState(false);
  const activeRoles = (id: string) =>
    roles.filter((r) => r.departmentId === id && r.status === "Active");
  const positions = (id: string) =>
    activeRoles(id).reduce((n, r) => n + r.positions, 0);
  const head = (d: Department) => byId(roles, d.headRoleId);

  const validate = (
    records: Record<string, string>[],
  ): RowCheck<Department>[] => {
    const dup = bulk.dupes(records.map((r) => r.code));
    const fileCodes = new Set(records.map((r) => (r.code ?? "").toUpperCase()));
    return records.map((r, i) => {
      const codeV = (r.code ?? "").toUpperCase();
      const parentCode = (r.parent_code ?? "").toUpperCase();
      const parent = departments.find((d) => d.code === parentCode);
      const status = bulk.pick(r.status || "Active", [
        "Active",
        "Inactive",
      ] as const);
      const value = {
        code: codeV,
        name: r.name ?? "",
        parentId: parent?.id ?? "",
        headRoleId: "",
        description: r.description ?? "",
        color: (departments.length + i) % DEPT_COLORS.length,
        status: status ?? "Active",
      };
      const errors = bulk.check(deptSchema, value);
      if (parentCode && !parent)
        errors.push(
          fileCodes.has(parentCode)
            ? `Parent ${parentCode} is in this file; upload parents first, then their sub-departments.`
            : `Parent department ${parentCode} does not exist.`,
        );
      if (!status) errors.push("status must be Active or Inactive.");
      if (departments.some((d) => d.code === codeV))
        errors.push(`Department code ${codeV} already exists.`);
      else if (dup.has(codeV))
        errors.push(`Code ${codeV} appears twice in the file.`);
      if (
        departments.some(
          (d) => d.name.toLowerCase() === (r.name ?? "").toLowerCase(),
        )
      )
        errors.push(`A department called ${r.name} already exists.`);
      const label = `${codeV || "?"} · ${r.name || "no name"}`;
      return errors.length
        ? { label, errors }
        : {
            label,
            value: {
              ...value,
              id: newId(),
              parentId: value.parentId || null,
              headRoleId: null,
            },
          };
    });
  };

  return (
    <div ref={ref}>
      <PageHead
        crumb="Departments"
        title="Departments"
        desc="Defines the departments associated with each role. This data is used by other modules but is exclusively created and maintained by admin."
        actions={
          <>
            <Button icon="network" onClick={() => navigate("/organogram")}>
              Organogram
            </Button>
            <Can privilege={MANAGE.organisation}>
              <Button icon="upload" onClick={() => setUpload(true)}>
                Bulk upload
              </Button>
              <Button tone="primary" icon="plus" onClick={() => setEdit("new")}>
                New department
              </Button>
            </Can>
          </>
        }
      />
      <div className="grid stats">
        <StatTile
          label="Departments"
          value={departments.filter((d) => d.status === "Active").length}
          icon="building"
          tone="blue"
        />
        <StatTile
          label="Sub-departments"
          value={
            departments.filter((d) => d.parentId && d.status === "Active")
              .length
          }
          icon="folderTree"
          tone="purple"
        />
      </div>
      <TablePanel
        title="All departments"
        subtitle="Filter by status using the chips; pick more than one to combine."
        rows={departments}
        rowKey={(d) => d.id}
        statusOf={(d) => d.status}
        chipNoun="statuses"
        columns={[
          {
            header: "Code",
            kind: "c-id",
            cell: (d) => (
              <button
                type="button"
                className="id-link dept-code"
                style={{ ["--dept" as string]: deptColor(d) }}
                onClick={canManage ? () => setEdit(d) : undefined}
              >
                {d.code}
              </button>
            ),
            csv: (d) => d.code,
          },
          {
            header: "Department / part of",
            kind: "c-sub",
            cell: (d) => (
              <>
                <strong>{d.name}</strong>
                <span className="sub">
                  {d.parentId
                    ? `Part of ${byId(departments, d.parentId)?.name ?? d.parentId}`
                    : "Top-level department"}
                </span>
              </>
            ),
            csv: (d) =>
              `${d.name}${d.parentId ? ` (part of ${byId(departments, d.parentId)?.code})` : ""}`,
          },
          {
            header: "Roles / positions",
            kind: "c-amt",
            cell: (d) => `${activeRoles(d.id).length} / ${positions(d.id)}`,
            csv: (d) => `${activeRoles(d.id).length}/${positions(d.id)}`,
          },
          {
            header: "Head",
            kind: "c-more",
            cell: (d) =>
              head(d) ? (
                <>
                  {head(d)!.title}
                  <span className={head(d)!.holder ? "sub" : "sub warn-text"}>
                    {head(d)!.holder || "Vacant"}
                  </span>
                </>
              ) : (
                <span className="warn-text">Not set</span>
              ),
            csv: (d) => head(d)?.title ?? "",
          },
          {
            header: "Status",
            kind: "c-status",
            cell: (d) => (
              <StatusBadge tone={ACTIVE_TONE(d.status)}>{d.status}</StatusBadge>
            ),
            csv: (d) => d.status,
          },
        ]}
        searchText={(d) =>
          `${d.code} ${d.name} ${head(d)?.title ?? ""} ${head(d)?.holder ?? ""}`
        }
        action={(d) => (
          <div className="row-actions">
            <Button
              size="sm"
              icon="network"
              onClick={() => navigate(`/organogram?dept=${d.id}`)}
            >
              Organogram
            </Button>
            <Can privilege={MANAGE.organisation}>
              <Button size="sm" icon="pencil" onClick={() => setEdit(d)}>
                Edit
              </Button>
            </Can>
          </div>
        )}
        searchPlaceholder="Search by code, name or head…"
        exportName="core-departments"
      />
      <Modal
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit === "new" ? "New department" : "Edit department"}
      >
        {edit && (
          <DepartmentForm
            key={edit === "new" ? "new" : edit.id}
            dept={edit === "new" ? undefined : edit}
            onDone={() => setEdit(null)}
          />
        )}
      </Modal>
      <BulkUpload
        open={upload}
        onOpenChange={setUpload}
        noun="departments"
        templateName="core-departments-template"
        fields={[
          {
            key: "code",
            label: "Department code",
            required: true,
            example: "LEG",
            hint: "Capitals, digits and hyphens",
          },
          {
            key: "name",
            label: "Department name",
            required: true,
            example: "Legal and contracts",
          },
          {
            key: "parent_code",
            label: "Part of (optional)",
            example: "",
            hint: `An existing department code: ${departments
              .filter((d) => d.status === "Active")
              .map((d) => d.code)
              .join(", ")}`,
          },
          {
            key: "description",
            label: "Description (optional)",
            example: "Contracts, claims and arbitration.",
          },
          {
            key: "status",
            label: "Status (optional)",
            example: "Active",
            hint: "Active or Inactive",
          },
        ]}
        validate={validate}
        onImport={(list) => void saveEach(list, (d) => saveDepartmentRemote(d), (d) => d.code, { one: "department", many: "departments" })}
        note={
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
            Set each department’s head role after adding its roles.
          </p>
        }
      />
    </div>
  );
}
