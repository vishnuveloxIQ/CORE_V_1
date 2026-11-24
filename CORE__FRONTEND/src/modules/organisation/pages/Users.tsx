import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BulkUpload, type RowCheck } from "@/shared/ui/data/BulkUpload";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Who } from "@/shared/ui/Avatar";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { MiniTable, Muted, Note, Tabs } from "@/shared/ui/Extras";
import { PageHead } from "@/modules/shell";
import { StatTile } from "@/shared/ui/StatTile";
import { StatusBadge } from "@/shared/ui/Status";
import {
  MODULES,
  type CoreUser,
  type ModuleName,
  type ScopeType,
} from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { bulk, saveEach } from "@/shared/lib/bulk";
import { idempotencyKey, tenantId } from "@/shared/lib/api";
import { loginPrefixFor, MANAGE, matchesCompanyPrefix, useCanManage } from '@/modules/auth';
import { ACTIVE_TONE, email, phone } from "@/shared/lib/core";
import { ago } from "@/shared/lib/format";
import { LOGIN_ID_RE, newId, nextLoginId, nowISO, useCore } from "@/modules/core-data";
import { ConfirmDialog, type Confirm } from "../components/ConfirmDialog";
import { TempPasswordDialog, type TempPassword } from "../components/TempPasswordDialog";
import { locationsText, modulesText, projectsText, workplaceOf } from "../utils/workplace";
import {
  RolesSection,
  sectionActions,
  sectionDesc,
  sectionHead,
  sectionTitle,
} from "../components/RolesSection";

const roleText = (u: CoreUser) =>
  u.role === "Module head" ? `${u.modules.join(", ")} head` : "Approver";

/**
 * Users and roles: module heads and high-level approvers are created here,
 * and the organisation's roles are listed below them. Module users stay in HRMS.
 */
export default function Users() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "users");
  const navigate = useNavigate();
  const { users, projects, createUserRemote } = useCore();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [upload, setUpload] = useState(false);
  // logins and one-time passwords from a CSV upload: held only while the dialog is open
  const [issued, setIssued] = useState<TempPassword[] | null>(null);

  /** Saves each CSV row through POST /users and shows the new logins and passwords once. */
  const importUsers = async (list: CoreUser[]) => {
    const created: TempPassword[] = [];
    await saveEach(
      list,
      async (u) => {
        const res = await createUserRemote(
          u.loginId,
          { name: u.name, email: u.email, phone: u.phone, designation: u.designation, role: u.role, modules: u.modules, scopeType: u.scopeType, scopeIds: u.scopeIds },
          idempotencyKey(),
        );
        created.push({ loginId: res.loginId, name: u.name, temporaryPassword: res.temporaryPassword });
      },
      (u) => `${u.loginId} (${u.name})`,
      { one: "user", many: "users" },
    );
    if (created.length) setIssued(created);
  };
  const [view, setView] = useState<"People" | "Roles">("People");
  const sites = useCore((s) => s.sites);
  // new login IDs are the company prefix and 4 digits (owner decision, 2026-11-22)
  const prefix = loginPrefixFor(tenantId());
  const work = (u: CoreUser) => workplaceOf(u, projects, sites);
  const open = (id: string) => navigate(`/users/${id}`);
  const kind = (u: CoreUser) =>
    u.status === "Inactive"
      ? "Inactive"
      : u.role === "Module head"
        ? "Module administrators"
        : "High-level approvers";

  const validate = (
    records: Record<string, string>[],
  ): RowCheck<CoreUser>[] => {
    const emails = bulk.dupes(records.map((r) => r.email));
    const taken = new Set<ModuleName>(
      users
        .filter((u) => u.role === "Module head" && u.status === "Active")
        .flatMap((u) => u.modules),
    );
    // login IDs already in use, plus the ones earlier rows of this file take
    const ids = users.map((u) => ({ loginId: u.loginId }));
    return records.map((r) => {
      const errors: string[] = [];
      const role = bulk.pick(
        r.role === "High-level approver" ? "Approver" : r.role,
        ["Module head", "Approver"] as const,
      );
      const mods = bulk.split(r.modules ?? "");
      const modules = mods
        .map((m) => bulk.pick(m, MODULES))
        .filter((m): m is ModuleName => !!m);
      const scopeType = bulk.pick(r.scope || "Company", [
        "Company",
        "Project",
      ] as const);
      const codes = bulk.split(r.scope_codes ?? "");
      const scopeIds =
        scopeType === "Project"
          ? codes.map(
              (c) =>
                projects.find((p) => p.code.toUpperCase() === c.toUpperCase())
                  ?.id,
            )
          : [];
      if (!r.name) errors.push("name is required.");
      if (!r.designation) errors.push("designation is required.");
      if (!email.safeParse(r.email).success) errors.push("email is not valid.");
      else if (
        users.some((u) => u.email.toLowerCase() === r.email.toLowerCase())
      )
        errors.push("A user with this email already exists.");
      else if (emails.has(r.email.toUpperCase()))
        errors.push("This email appears twice in the file.");
      if (!phone.safeParse(r.phone).success)
        errors.push("phone must be a 10-digit mobile number.");
      const loginId = (r.login_id ?? "").trim().toUpperCase();
      if (loginId && prefix && !matchesCompanyPrefix(loginId, prefix))
        errors.push(`login_id must be ${prefix} followed by 4 digits, e.g. ${prefix}1201.`);
      else if (loginId && !LOGIN_ID_RE.test(loginId))
        errors.push(
          "login_id must be 3–6 letters or digits followed by 4 digits, e.g. VELOX1234.",
        );
      else if (loginId && ids.some((x) => x.loginId.toUpperCase() === loginId))
        errors.push("This login_id is already taken.");
      if (!role) errors.push('role must be "Module head" or "Approver".');
      if (role === "Module head") {
        if (!mods.length)
          errors.push(
            'A module head needs at least one module, e.g. "Stores; P&M".',
          );
        if (modules.length !== mods.length)
          errors.push(`modules must be from: ${MODULES.join(", ")}.`);
        const clash = modules.filter((m) => taken.has(m));
        if (clash.length)
          errors.push(
            `${clash.join(", ")} already ${clash.length === 1 ? "has" : "have"} an active head.`,
          );
      }
      if (!scopeType) errors.push("scope must be Company or Project.");
      else if (
        scopeType !== "Company" &&
        (!codes.length || scopeIds.some((x) => !x))
      )
        errors.push(
          `scope_codes must list project codes, e.g. ${projects[0]?.code}.`,
        );
      const label = `${r.name || "?"} · ${role === "Module head" ? `${modules.join(", ") || "?"} head` : (role ?? "?")}`;
      if (errors.length) return { label, errors };
      if (role === "Module head") modules.forEach((m) => taken.add(m)); // the next row cannot take the same module
      const finalId = loginId || nextLoginId(ids, prefix);
      ids.push({ loginId: finalId });
      return {
        label,
        value: {
          id: newId(),
          name: r.name,
          email: r.email,
          phone: r.phone,
          designation: r.designation,
          loginId: finalId,
          role: role!,
          modules:
            role === "Module head"
              ? MODULES.filter((m) => modules.includes(m))
              : [],
          scopeType: scopeType as ScopeType,
          scopeIds: scopeIds as string[],
          privileges: [],
          status: "Active",
          mustChangePassword: true,
          lastLogin: null,
          createdAt: nowISO(),
        },
      };
    });
  };

  const canAccess = useCanManage(MANAGE.access);
  const usersLoad = useCore((s) => s.usersLoad);
  const usersError = useCore((s) => s.usersError);

  return (
    <div ref={ref}>
      <PageHead
        crumb="Users and roles"
        title="Users and roles"
        desc="Create user accounts for module heads and higher-level approvers, and maintain the roles they hold in the organisation."
      />

      <Tabs
        value={view}
        onChange={setView}
        items={["People", "Roles"] as const}
        label="Users and roles view"
      />
      {view === "People" && (
      <section aria-labelledby="people-heading">
        <div style={sectionHead}>
          <div>
            <h2 id="people-heading" style={sectionTitle}>
              People
            </h2>
            <p style={sectionDesc}>
              Module administrators and high-level approvers. Module users are
              managed in HRMS.
            </p>
          </div>
          <div style={sectionActions}>
            {canAccess && (
              <Button icon="upload" onClick={() => setUpload(true)}>
                Bulk upload
              </Button>
            )}
            {canAccess && (
              <Button
                tone="primary"
                icon="userPlus"
                onClick={() => navigate("/users/new")}
              >
                New user
              </Button>
            )}
          </div>
        </div>
        {usersLoad === "error" && (
          <Note title="The user list could not be loaded" icon="ban">
            {canAccess
              ? usersError
              : "You need the access privilege to see users. Ask a Tenant Admin to give you access."}
          </Note>
        )}
        <div className="grid stats">
          <StatTile
            label="Module administrators"
            value={
              users.filter(
                (u) => u.role === "Module head" && u.status === "Active",
              ).length
            }
            icon="userCog"
            tone="blue"
          />
          <StatTile
            label="High-level approvers"
            value={
              users.filter((u) => u.role === "Approver" && u.status === "Active")
                .length
            }
            icon="shield"
            tone="purple"
          />
          <StatTile
            label="Inactive"
            value={users.filter((u) => u.status === "Inactive").length}
            icon="userX"
            tone="rose"
          />
        </div>
        <TablePanel
          className="fit-table"
          title="Employees"
          subtitle="Everyone with a CORE account: the projects and locations they work on and the modules they are used for. Filter by user type using the chips; open a person to update their role, modules, scope or privileges."
          rows={users}
          rowKey={(u) => u.id}
          statusOf={kind}
          chipNoun="user types"
          columns={[
            {
              header: "Login ID",
              kind: "c-id",
              cell: (u) => (
                <button
                  type="button"
                  className="id-link"
                  onClick={() => open(u.id)}
                >
                  {u.loginId}
                </button>
              ),
              csv: (u) => u.loginId,
            },
            {
              header: "Name / email",
              kind: "c-sub",
              cell: (u) => (
                <Who name={u.name} sub={`${u.designation} · ${u.email}`} />
              ),
              csv: (u) => `${u.name} (${u.email})`,
            },
            {
              header: "Role",
              kind: "c-amt",
              cell: (u) =>
                u.role === "Module head" ? (
                  <span className="mod-pills">
                    {u.modules.map((m) => (
                      <span key={m} className="cell-pill">
                        {m}
                      </span>
                    ))}
                    <span className="sub">Module administrator</span>
                  </span>
                ) : (
                  "Approver"
                ),
              csv: roleText,
            },
            {
              header: "Projects",
              kind: "c-more",
              cell: (u) => <span style={{ whiteSpace: "normal" }}>{projectsText(work(u))}</span>,
              csv: (u) => projectsText(work(u)),
            },
            {
              header: "Locations",
              kind: "c-more",
              cell: (u) => <span style={{ whiteSpace: "normal" }}>{locationsText(work(u))}</span>,
              csv: (u) => locationsText(work(u)),
            },
            { header: "Modules", kind: "c-more", cell: modulesText, csv: modulesText },
            {
              header: "Privileges",
              kind: "c-more",
              cell: (u) =>
                u.role === "Module head" ? `${u.privileges.length} granted` : "—",
              csv: (u) => u.privileges.join(" "),
            },
            {
              header: "Last sign-in",
              kind: "c-more",
              cell: (u) => (
                <>
                  {u.lastLogin ? ago(u.lastLogin) : "Never"}
                  {u.mustChangePassword && (
                    <span className="sub warn-text">Must change password</span>
                  )}
                </>
              ),
              csv: (u) => u.lastLogin ?? "",
            },
            {
              header: "Status",
              kind: "c-status",
              cell: (u) => (
                <StatusBadge tone={ACTIVE_TONE(u.status)}>{u.status}</StatusBadge>
              ),
              csv: (u) => u.status,
            },
          ]}
          searchText={(u) =>
            `${u.loginId} ${u.name} ${u.email} ${u.designation} ${roleText(u)} ${projectsText(work(u))} ${locationsText(work(u))}`
          }
          action={(u) => (
            <div className="row-actions">
              <Button size="sm" icon="pencil" onClick={() => open(u.id)}>
                Open
              </Button>
              <Button
                size="sm"
                icon="key"
                onClick={() => setConfirm({ kind: "reset", user: u })}
              >
                Reset password
              </Button>
              <Button
                size="sm"
                tone={u.status === "Active" ? "danger" : "success"}
                icon={u.status === "Active" ? "userMinus" : "userCheck"}
                onClick={() => setConfirm({ kind: "status", user: u })}
              >
                {u.status === "Active" ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          )}
          searchPlaceholder="Search by name, email, ID or designation…"
          exportName="core-users"
        />
        <div className="grid dash-grid mt-4">
          <Card
            title="Module administrators by module"
            subtitle="Each module has one active administrator. One person may administer several modules."
          >
            <MiniTable
              head={["Module", "Administrator", ""]}
              rows={MODULES.map((m) => {
                const h = users.find(
                  (u) =>
                    u.role === "Module head" &&
                    u.modules.includes(m) &&
                    u.status === "Active",
                );
                return [
                  <strong key="m">{m}</strong>,
                  h ? (
                    <Who
                      key="h"
                      name={h.name}
                      sub={
                        h.modules.length > 1
                          ? `${h.designation} · also administers ${h.modules.filter((x) => x !== m).join(", ")}`
                          : h.designation
                      }
                    />
                  ) : (
                    <span key="h" className="warn-text">
                      Vacant
                    </span>
                  ),
                  h ? (
                    <Button key="b" size="sm" onClick={() => open(h.id)}>
                      Open
                    </Button>
                  ) : (
                    <Button
                      key="b"
                      size="sm"
                      icon="plus"
                      onClick={() => navigate("/users/new")}
                    >
                      Assign
                    </Button>
                  ),
                ];
              })}
            />
          </Card>
          <Card title="Module users" subtitle="Not managed in CORE">
            <Note
              title="Module users come from HRMS"
              icon="users"
              className="mt-0"
            >
              They are created in HRMS and assigned to a module there. Each module
              administrator manages the users of their own module.
            </Note>
            <p style={{ margin: "14px 0 0" }}>
              <Muted>
                Only module administrators and high-level approvers are created in
                CORE.
              </Muted>
            </p>
          </Card>
        </div>
      </section>
      )}

      {view === "Roles" && <RolesSection />}

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
      <TempPasswordDialog entries={issued} title="Users created" onClose={() => setIssued(null)} />
      <BulkUpload
        open={upload}
        onOpenChange={setUpload}
        noun="users"
        templateName="core-users-template"
        fields={[
          {
            key: "name",
            label: "Full name",
            required: true,
            example: "Meena Joshi",
          },
          {
            key: "designation",
            label: "Designation",
            required: true,
            example: "Vice president, finance",
          },
          {
            key: "email",
            label: "Email",
            required: true,
            example: "meena.joshi@veloxiq.example",
          },
          {
            key: "phone",
            label: "10-digit mobile",
            required: true,
            example: "9811100099",
          },
          {
            key: "login_id",
            label: "Login ID (optional, generated when blank)",
            example: `${prefix ?? "VELOX"}1201`,
          },
          {
            key: "role",
            label: "Role",
            required: true,
            example: "Approver",
            hint: "Module head (module administrator) or Approver",
          },
          {
            key: "modules",
            label: "Modules headed (module heads only)",
            example: "",
            hint: `One or more of ${MODULES.join(", ")}, separated by ;`,
          },
          {
            key: "scope",
            label: "Scope",
            example: "Company",
            hint: "Company or Project",
          },
          {
            key: "scope_codes",
            label: "Project codes for the scope",
            example: "",
            hint: "e.g. NH65-PKG2; MTR-DEP",
          },
        ]}
        examples={[
          [
            "Arvind Rao",
            "General manager, projects",
            "arvind.rao@veloxiq.example",
            "9811100088",
            "",
            "Approver",
            "",
            "Project",
            "NH65-PKG2; MTR-DEP",
          ],
        ]}
        validate={validate}
        onImport={(list) => void importUsers(list)}
        note={
          <Note
            title="Privileges are granted one by one"
            icon="shield"
            className="mt-0"
          >
            Users are created without privileges. Open each module administrator
            to grant them; that needs step-up verification. The new logins and
            their temporary passwords are shown once after the upload.
          </Note>
        }
      />
    </div>
  );
}
