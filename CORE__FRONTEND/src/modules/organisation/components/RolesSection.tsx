import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BulkUpload, type RowCheck } from "@/shared/ui/data/BulkUpload";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { StatTile } from "@/shared/ui/StatTile";
import { StatusBadge } from "@/shared/ui/Status";
import type { Role } from "@/modules/core-data";
import { bulk, saveEach } from "@/shared/lib/bulk";
import { ApiError } from "@/shared/lib/api";
import { ACTIVE_TONE, byId } from "@/shared/lib/core";
import { newId, useCore } from "@/modules/core-data";
import {
  deptColor,
  GRADES,
  gradeBand,
  heldText,
  isVacant,
  roleRules,
  roleSchema,
} from "../utils/org";
import { RoleForm } from "./RoleForm";

/** Roles section of Users and roles: every role, its department, grade and who it reports to. `?dept=` preselects a department chip. */
export function RolesSection() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { roles, departments, saveRoleRemote } = useCore();
  /**
   * Saves each role with POST /organisation/positions, in file order. A role may report to one earlier in the file:
   * its reporting line is pointed at the id the server gave that role, and refused when that role was not saved.
   */
  const importRoles = async (list: Role[]) => {
    const inFile = new Set(list.map((r) => r.id));
    const saved = new Map<string, string>();
    await saveEach(
      list,
      async (r) => {
        const boss = r.reportsToId ?? "";
        if (inFile.has(boss) && !saved.has(boss))
          throw new ApiError(409, "NOT_SAVED", "The role it reports to in this file was not saved.");
        const out = await saveRoleRemote({ ...r, reportsToId: saved.get(boss) ?? r.reportsToId });
        saved.set(r.id, out.id);
      },
      (r) => r.code,
      { one: "role", many: "roles" },
    );
  };
  const [edit, setEdit] = useState<Role | "new" | null>(null);
  const [upload, setUpload] = useState(false);
  const dept = (r: Role) => byId(departments, r.departmentId);
  const boss = (r: Role) => byId(roles, r.reportsToId);
  const reports = (r: Role) =>
    roles.filter((x) => x.reportsToId === r.id && x.status === "Active").length;
  const active = roles.filter((r) => r.status === "Active");
  const preset = departments
    .filter((d) => d.id === params.get("dept"))
    .map((d) => d.name);

  const validate = (records: Record<string, string>[]): RowCheck<Role>[] => {
    const dup = bulk.dupes(records.map((r) => r.code));
    const added: Role[] = [];
    return records.map((r) => {
      const codeV = (r.code ?? "").toUpperCase();
      const d = departments.find(
        (x) => x.code === (r.department_code ?? "").toUpperCase(),
      );
      const pool = [...roles, ...added];
      const reportsTo = r.reports_to_code
        ? pool.find((x) => x.code === r.reports_to_code.toUpperCase())
        : undefined;
      const grade = bulk.pick(r.grade ?? "", GRADES);
      const status = bulk.pick(r.status || "Active", [
        "Active",
        "Inactive",
      ] as const);
      const positions = bulk.num(r.positions || "1");
      const value = {
        title: r.title ?? "",
        code: codeV,
        departmentId: d?.id ?? "",
        grade: grade ?? ("" as never),
        reportsToId: reportsTo?.id ?? "",
        positions,
        holder: positions === 1 ? (r.held_by ?? "") : "",
        description: r.description ?? "",
        status: status ?? "Active",
      };
      const errors = bulk.check(roleSchema, value);
      if (r.department_code && !d)
        errors.push(`Department ${r.department_code} does not exist.`);
      if (!grade) errors.push(`grade must be one of ${GRADES.join(", ")}.`);
      if (!r.reports_to_code)
        errors.push(
          "reports_to_code is required; only the existing top role reports to no one.",
        );
      else if (!reportsTo)
        errors.push(
          `No role with code ${r.reports_to_code} (it must exist already or appear earlier in the file).`,
        );
      if (!status) errors.push("status must be Active or Inactive.");
      if (dup.has(codeV))
        errors.push(`Code ${codeV} appears twice in the file.`);
      if (!errors.length)
        roleRules(value, undefined, pool, departments).forEach(([, m]) =>
          errors.push(m),
        );
      const label = `${codeV || "?"} · ${r.title || "no title"}`;
      if (errors.length) return { label, errors };
      const role: Role = {
        ...value,
        id: newId(),
        reportsToId: reportsTo!.id,
      };
      added.push(role);
      return { label, value: role };
    });
  };

  return (
    <section aria-labelledby="roles-heading" style={{ marginTop: 32 }}>
      <div className="section-head" style={sectionHead}>
        <div>
          <h2 id="roles-heading" style={sectionTitle}>
            Roles
          </h2>
          <p style={sectionDesc}>
            Organisational roles with their department, grade and reporting
            line. The organogram is derived from this list.
          </p>
        </div>
        <div style={sectionActions}>
          <Button icon="network" onClick={() => navigate("/organogram")}>
            Organogram
          </Button>
          <Button icon="upload" onClick={() => setUpload(true)}>
            Bulk upload
          </Button>
          <Button tone="primary" icon="plus" onClick={() => setEdit("new")}>
            New role
          </Button>
        </div>
      </div>
      <div className="grid stats">
        <StatTile label="Roles" value={active.length} icon="role" tone="blue" />

        <StatTile
          label="Vacant Key Roles"
          value={roles.filter(isVacant).length}
          icon="userSearch"
          tone="rose"
        />
      </div>
      <TablePanel
        key={preset.join()}
        title="All roles"
        subtitle="Filter by department using the chips; pick more than one to combine. Search by role, code, person or department."
        rows={roles}
        rowKey={(r) => r.id}
        statusOf={(r) => dept(r)?.name ?? "No department"}
        chipLimit={5}
        chipNoun="departments"
        initialPicked={preset}
        columns={[
          {
            header: "Code",
            kind: "c-id",
            cell: (r) => (
              <button
                type="button"
                className="id-link"
                onClick={() => setEdit(r)}
              >
                {r.code}
              </button>
            ),
            csv: (r) => r.code,
          },
          {
            header: "Role / department",
            kind: "c-sub",
            cell: (r) => (
              <>
                <strong>{r.title}</strong>
                <span className="sub">
                  <i
                    className="dept-dot"
                    style={{ ["--dept" as string]: deptColor(dept(r)) }}
                  />
                  {dept(r)?.name ?? "—"}
                </span>
              </>
            ),
            csv: (r) => `${r.title} (${dept(r)?.code ?? ""})`,
          },
          {
            header: "Held by",
            kind: "c-amt",
            cell: (r) => (
              <span className={isVacant(r) ? "warn-text" : undefined}>
                {heldText(r)}
              </span>
            ),
            csv: heldText,
          },
          {
            header: "Reports to",
            kind: "c-more",
            cell: (r) =>
              boss(r) ? (
                <>
                  {boss(r)!.title}
                  <span className="sub">
                    {boss(r)!.holder ||
                      byId(departments, boss(r)!.departmentId)?.code}
                  </span>
                </>
              ) : (
                <strong>Top of organisation</strong>
              ),
            csv: (r) => boss(r)?.title ?? "Top",
          },
          {
            header: "Grade",
            kind: "c-more",
            cell: (r) => (
              <>
                <span className="cell-pill">{r.grade}</span>
                <span className="sub">{gradeBand(r.grade)}</span>
              </>
            ),
            csv: (r) => r.grade,
          },
          {
            header: "Direct reports",
            kind: "c-more",
            cell: (r) => reports(r) || "—",
            csv: (r) => String(reports(r)),
          },
          {
            header: "Status",
            kind: "c-status",
            cell: (r) => (
              <StatusBadge tone={ACTIVE_TONE(r.status)}>{r.status}</StatusBadge>
            ),
            csv: (r) => r.status,
          },
        ]}
        searchText={(r) =>
          `${r.code} ${r.title} ${r.holder} ${dept(r)?.name ?? ""} ${boss(r)?.title ?? ""} ${r.grade}`
        }
        action={(r) => (
          <div className="row-actions">
            <Button
              size="sm"
              icon="network"
              onClick={() => navigate(`/organogram?role=${r.id}`)}
            >
              On chart
            </Button>
            <Button size="sm" icon="pencil" onClick={() => setEdit(r)}>
              Edit
            </Button>
          </div>
        )}
        searchPlaceholder="Search by role, code, person or department…"
        exportName="core-roles"
      />
      <Modal
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit === "new" ? "New role" : "Edit role"}
      >
        {edit && (
          <RoleForm
            key={edit === "new" ? "new" : edit.id}
            role={edit === "new" ? undefined : edit}
            onDone={() => setEdit(null)}
          />
        )}
      </Modal>
      <BulkUpload
        open={upload}
        onOpenChange={setUpload}
        noun="roles"
        templateName="core-roles-template"
        fields={[
          {
            key: "code",
            label: "Role code",
            required: true,
            example: "SE-HWY",
            hint: "Capitals, digits and hyphens",
          },
          {
            key: "title",
            label: "Role title",
            required: true,
            example: "Highway engineer",
          },
          {
            key: "department_code",
            label: "Department",
            required: true,
            example: "PRJ",
            hint: departments
              .filter((d) => d.status === "Active")
              .map((d) => d.code)
              .join(", "),
          },
          {
            key: "grade",
            label: "Grade",
            required: true,
            example: "S2",
            hint: GRADES.join(", "),
          },
          {
            key: "reports_to_code",
            label: "Reports to (role code)",
            required: true,
            example: "PM",
            hint: "An existing role code, or one earlier in the file",
          },
          {
            key: "positions",
            label: "Planned positions (optional)",
            example: "4",
            hint: "Whole number, default 1",
          },
          {
            key: "held_by",
            label: "Held by (single-position roles, optional)",
            example: "",
          },
          {
            key: "description",
            label: "What the role does (optional)",
            example: "Highway layers and levels.",
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
            "QS",
            "Quantity surveyor",
            "PRJ",
            "S2",
            "PM",
            "3",
            "",
            "Measurements and bills.",
            "Active",
          ],
        ]}
        validate={validate}
        onImport={(list) => void importRoles(list)}
      />
    </section>
  );
}

export const sectionHead = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  margin: "0 0 14px",
} as const;
export const sectionActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
} as const;
export const sectionTitle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 650,
} as const;
export const sectionDesc = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "var(--ink-2)",
} as const;
