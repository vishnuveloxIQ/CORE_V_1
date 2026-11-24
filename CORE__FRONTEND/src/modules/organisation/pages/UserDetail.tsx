import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { errorText } from "@/shared/lib/api";
import { Who } from "@/shared/ui/Avatar";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { KV, MiniTable, Muted, Note } from "@/shared/ui/Extras";
import { Can, MANAGE, useCanManage } from '@/modules/auth';
import { PageHead } from "@/modules/shell";
import { StatusBadge } from "@/shared/ui/Status";
import { PRIVILEGES, changeSummary, listAudit } from "@/modules/core-data";
import type { AuditEntry, CoreUser } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { ACTIVE_TONE, byId } from "@/shared/lib/core";
import { ago, fmtDateTime } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { useCore } from "@/modules/core-data";
import { ConfirmDialog, type Confirm } from "../components/ConfirmDialog";
import { TempPasswordDialog, type TempPassword } from "../components/TempPasswordDialog";
import { PrivilegeGrants } from "../components/PrivilegeGrants";
import { UserForm } from "../components/UserForm";
import { modulesText, workplaceOf } from "../utils/workplace";

/** New user (/users/new), or one user (/users/:id): details first, Edit user opens the form. */
export default function UserDetail() {
  const ref = useRef<HTMLDivElement>(null);
  const { id = "new" } = useParams();
  useEnter(ref, `user-${id}`);
  const navigate = useNavigate();
  const user = useCore((s) => s.users.find((u) => u.id === id));
  // change history of this user, read from the server audit trail (the newest 200 user changes are searched)
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    if (id === "new") return;
    let live = true;
    listAudit({ entityType: "core_user", limit: 200 })
      .then((r) => {
        if (!live) return;
        setHistory(r.entries.filter((a) => a.entityId === id));
        setHistoryError("");
      })
      .catch((err) => { if (live) setHistoryError(errorText(err)); });
    return () => { live = false; };
  }, [id]);
  const chains = useCore((s) => s.chains);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [editing, setEditing] = useState(false);
  const canAccess = useCanManage(MANAGE.access);
  // the new user's one-time password: held here only while the dialog is open, then dropped
  const [created, setCreated] = useState<{ id: string; entry: TempPassword } | null>(null);
  const back = (
    <Button icon="chevL" onClick={() => navigate("/users")}>
      Back to users
    </Button>
  );
  const isNew = id === "new";

  if (!isNew && !user) {
    return (
      <div ref={ref}>
        <PageHead
          crumb="Users"
          title="User not found"
          desc={`No user with ID ${id}.`}
          actions={back}
        />
        <Card>
          <EmptyState icon="users" title="Nothing to show">
            Go back to the users list.
          </EmptyState>
        </Card>
      </div>
    );
  }
  if (isNew && !canAccess) {
    return (
      <div ref={ref}>
        <PageHead
          crumb="New user"
          title="New user"
          desc="Only a Tenant Admin can create user accounts."
          actions={back}
        />
        <Note title="You need the access privilege to add users" icon="ban">
          Ask a Tenant Admin to create the account.
        </Note>
      </div>
    );
  }
  if (isNew || !user) {
    return (
      <div ref={ref}>
        <PageHead
          crumb="New user"
          title="New user"
          desc="Create a module head or a high-level approver. Fields marked * are required."
          actions={back}
        />
        <Card className="max-w-[920px]" title="User details">
          <UserForm
            key="new"
            onCancel={() => navigate("/users")}
            onSaved={(newId, entry) => {
              notify("User created");
              // stay on this page until the password dialog is closed, so the password is not carried through navigation
              if (entry) setCreated({ id: newId, entry });
              else navigate(`/users/${newId}`);
            }}
          />
        </Card>
        <TempPasswordDialog
          entries={created ? [created.entry] : null}
          title="User created"
          onClose={() => {
            const next = created?.id;
            setCreated(null);
            if (next) navigate(`/users/${next}`);
          }}
        />
      </div>
    );
  }

  // where this person sits in the approval matrix (latest version of each chain)
  const placements = chains.flatMap((c) => {
    const v = c.versions[c.versions.length - 1];
    return v.levels
      .map((l, i) =>
        l.approverId === user.id ? { chain: c, level: i + 1 } : null,
      )
      .filter((x): x is { chain: typeof c; level: number } => !!x);
  });

  return (
    <div ref={ref}>
      <PageHead
        crumb={user.name}
        title={user.name}
        desc={`${user.designation}, ${user.role === "Module head" ? `${user.modules.join(", ")} head` : "high-level approver"}. Login ID ${user.loginId}.`}
        actions={
          <>
            {back}
            <Can privilege={MANAGE.access}>
              <Button
                icon="key"
                onClick={() => setConfirm({ kind: "reset", user })}
              >
                Reset password
              </Button>
              <Button
                tone={user.status === "Active" ? "danger" : "success"}
                onClick={() => setConfirm({ kind: "status", user })}
              >
                {user.status === "Active" ? "Deactivate" : "Reactivate"}
              </Button>
              {!editing && (
                <Button
                  tone="primary"
                  icon="pencil"
                  onClick={() => setEditing(true)}
                >
                  Edit user
                </Button>
              )}
            </Can>
          </>
        }
      />
      <div className="form-layout">
        {editing ? (
          <Card title="Edit details, role and access">
            <UserForm
              key={`${user.id}-${user.status}`}
              user={user}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                notify("User saved");
                setEditing(false);
              }}
            />
          </Card>
        ) : (
          <UserView user={user} onEdit={() => setEditing(true)} />
        )}
        <div className="stack">
          <Card title="In the approval matrix" subtitle="Latest chain versions">
            <MiniTable
              head={["Request type", "Level", ""]}
              empty="Not an approver in any chain yet."
              rows={placements.map((p) => [
                <span key="t">
                  <strong>{p.chain.requestType}</strong>
                  <span className="sub">
                    {p.chain.scopeType === "Company"
                      ? "Company-wide"
                      : `${p.chain.scopeType} chain ${p.chain.id}`}
                  </span>
                </span>,
                `L${p.level}`,
                <Button
                  key="b"
                  size="sm"
                  onClick={() => navigate(`/approval-matrix/${p.chain.id}`)}
                >
                  Open
                </Button>,
              ])}
            />
          </Card>
          <Card
            title="Change history"
            subtitle={`Created ${fmtDateTime(user.createdAt)}`}
          >
            <MiniTable
              head={["When", "Change"]}
              empty={historyError || "No changes recorded."}
              rows={history.map((a) => [
                fmtDateTime(a.at),
                <span key="c">
                  {a.action} · {a.user}
                  <span className="sub">{changeSummary(a)}</span>
                </span>,
              ])}
            />
          </Card>
        </div>
      </div>
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function UserView({ user: u, onEdit }: { user: CoreUser; onEdit: () => void }) {
  const projects = useCore((s) => s.projects);
  const sites = useCore((s) => s.sites);
  const work = workplaceOf(u, projects, sites);
  const label = (pid: string) =>
    Object.values(PRIVILEGES)
      .flat()
      .find((p) => p.id === pid)?.label ?? pid;
  const scope =
    u.scopeType === "Company"
      ? "Company-wide"
      : u.scopeIds
          .map((id) => byId(projects, id)?.name ?? id)
          .join(", ");
  return (
    <div className="stack">
      <Card
        title="Person"
        action={
          <Button size="sm" icon="pencil" onClick={onEdit}>
            Edit
          </Button>
        }
      >
        <div className="detail-grid">
          <KV k="Name" full>
            <Who name={u.name} sub={u.designation} />
          </KV>
          <KV k="Email">
            <strong>{u.email}</strong>
          </KV>
          <KV k="Mobile">
            <strong>{u.phone}</strong>
          </KV>
          <KV k="Login ID">
            <strong>{u.loginId}</strong>
          </KV>
          <KV k="Status">
            <StatusBadge tone={ACTIVE_TONE(u.status)}>{u.status}</StatusBadge>
          </KV>
          <KV k="Last sign-in">
            <strong>{u.lastLogin ? ago(u.lastLogin) : "Never"}</strong>
            {u.mustChangePassword && (
              <span className="sub warn-text">Must change password</span>
            )}
          </KV>
        </div>
      </Card>
      <Card title="Role and access">
        <div className="detail-grid">
          <KV k="Role">
            <strong>
              {u.role === "Approver" ? "High-level approver" : "Module head"}
            </strong>
          </KV>
          <KV k="Modules used for">
            {u.role === "Module head" && u.modules.length ? (
              <span className="mod-pills">
                {u.modules.map((m) => (
                  <span key={m} className="cell-pill">
                    {m}
                  </span>
                ))}
              </span>
            ) : (
              <strong>{modulesText(u)}</strong>
            )}
          </KV>
          <KV k={`Scope (${u.scopeType.toLowerCase()})`}>
            <strong>{scope}</strong>
          </KV>
          <KV k="Projects" full>
            {work.companyWide ? (
              <strong>All projects</strong>
            ) : work.projects.length ? (
              <span className="mod-pills">
                {work.projects.map((p) => (
                  <span key={p.id} className="cell-pill" title={p.name}>
                    {p.code} · {p.name}
                  </span>
                ))}
              </span>
            ) : (
              <Muted>No project assigned.</Muted>
            )}
          </KV>
          <KV k="Locations" full>
            {work.companyWide ? (
              <strong>All locations</strong>
            ) : work.locations.length ? (
              <span className="mod-pills">
                {work.locations.map((l) => (
                  <span key={l.id} className="cell-pill">
                    {l.name} ({l.code})
                  </span>
                ))}
              </span>
            ) : (
              <Muted>No location under these projects yet.</Muted>
            )}
          </KV>
        </div>
        {u.role === "Module head" && (
          <>
            <h3 className="section-t">Privileges ({u.privileges.length})</h3>
            {u.privileges.length ? (
              <div className="mod-pills">
                {u.privileges.map((p) => (
                  <span key={p} className="cell-pill" title={p}>
                    {label(p)}
                  </span>
                ))}
              </div>
            ) : (
              <Muted>No privileges granted yet.</Muted>
            )}
          </>
        )}
      </Card>
      <PrivilegeGrants userId={u.id} />
    </div>
  );
}
