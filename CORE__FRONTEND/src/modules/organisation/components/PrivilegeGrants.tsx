import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { MiniTable, Muted } from "@/shared/ui/Extras";
import { FormGroup, Select } from "@/shared/ui/Field";
import { Modal } from "@/shared/ui/Modal";
import { accessApi, asUuid } from "@/modules/core-data";
import { errorText } from "@/shared/lib/api";
import { fmtDate } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { requireStepUp } from "@/shared/lib/stepUp";

/** The admin privileges the backend accepts on a grant (dotted names, see access/schema.ts). */
const ADMIN_PRIVILEGES: { id: string; label: string }[] = [
  { id: "access.manage", label: "Manage user access" },
  { id: "organisation.manage", label: "Manage organisation" },
  { id: "policies.manage", label: "Manage policies" },
  { id: "approvals.manage", label: "Manage approvals" },
  { id: "masters.manage", label: "Manage masters" },
  { id: "projects.manage", label: "Manage projects" },
  { id: "records.manage", label: "Manage records" },
];
const labelOf = (id: string) => ADMIN_PRIVILEGES.find((p) => p.id === id)?.label ?? id;

/**
 * Admin privileges granted to one user, read from GET /access/users/{id}. Grant adds a privilege grant;
 * Revoke removes that grant by its id. Only server users (UUID ids) can be read or changed.
 */
export function PrivilegeGrants({ userId }: { userId: string }) {
  const server = !!asUuid(userId);
  const [access, setAccess] = useState<accessApi.AccessView | null>(null);
  const [error, setError] = useState("");
  const [granting, setGranting] = useState(false);
  const [busyId, setBusyId] = useState("");

  const reload = useCallback(
    () =>
      accessApi.getUserAccess(userId).then(
        (a) => { setAccess(a); setError(""); },
        (err: unknown) => { setAccess(null); setError(errorText(err)); },
      ),
    [userId],
  );
  useEffect(() => {
    if (server) void reload();
  }, [reload, server]);

  const granted = (access?.grants ?? []).filter((g) => g.accessType === "privilege" && g.privilege);
  const available = ADMIN_PRIVILEGES.filter((p) => !granted.some((g) => g.privilege === p.id));

  const revoke = async (g: accessApi.GrantView) => {
    if (!(await requireStepUp(`Revoke ${labelOf(g.privilege ?? "")}`))) return;
    setBusyId(g.id);
    try {
      await accessApi.revokeGrant(g.id);
      notify(`${labelOf(g.privilege ?? "")} revoked`);
      await reload();
    } catch (err) {
      notify(`Not revoked: ${errorText(err)}`, 6000);
    } finally {
      setBusyId("");
    }
  };

  return (
    <Card
      title="Admin privileges"
      subtitle="Granted on the server. Revoking takes the privilege away at once."
      action={server && access && !error ? (
        <Button size="sm" icon="plus" disabled={!available.length} onClick={() => setGranting(true)}>Grant privilege</Button>
      ) : undefined}
    >
      {!server ? (
        <Muted>This user is sample data and is not on the server, so admin privileges cannot be granted here.</Muted>
      ) : error ? (
        <Muted>Privileges could not be read: {error}</Muted>
      ) : !access ? (
        <Muted>Loading privileges…</Muted>
      ) : (
        <MiniTable
          head={["Privilege", "Granted", ""]}
          empty="No admin privileges granted."
          rows={granted.map((g) => [
            <strong key="p">{labelOf(g.privilege ?? "")}</strong>,
            fmtDate(g.createdAt),
            <Button key="r" size="sm" tone="danger" disabled={busyId === g.id} onClick={() => void revoke(g)}>Revoke</Button>,
          ])}
        />
      )}
      <Modal open={granting} onOpenChange={setGranting} title="Grant privilege">
        {granting && (
          <GrantForm
            userId={userId}
            options={available}
            onDone={() => {
              setGranting(false);
              void reload();
            }}
          />
        )}
      </Modal>
    </Card>
  );
}

function GrantForm({ userId, options, onDone }: { userId: string; options: { id: string; label: string }[]; onDone: () => void }) {
  const [privilege, setPrivilege] = useState(options[0]?.id ?? "");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!privilege) return setFormError("Pick a privilege.");
    setFormError("");
    if (!(await requireStepUp(`Grant ${labelOf(privilege)}`))) return;
    setBusy(true);
    try {
      await accessApi.grantAccess(userId, { accessType: "privilege", privilege });
      notify(`${labelOf(privilege)} granted`);
      onDone();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form noValidate onSubmit={submit}>
      {formError && (
        <div className="login-error" role="alert" style={{ marginBottom: 14 }}>
          <span>{formError}</span>
        </div>
      )}
      <FormGroup label="Privilege" required>
        {(id) => (
          <Select id={id} value={privilege} onChange={(e) => setPrivilege(e.target.value)}>
            {options.map((p) => (
              <option key={p.id} value={p.id}>{`${p.label} (${p.id})`}</option>
            ))}
          </Select>
        )}
      </FormGroup>
      <div className="form-actions">
        <Button type="submit" tone="primary" disabled={busy || !privilege}>Grant privilege</Button>
      </div>
    </form>
  );
}
