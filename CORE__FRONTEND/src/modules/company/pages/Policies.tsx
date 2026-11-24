import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Muted } from "@/shared/ui/Extras";
import { Modal } from "@/shared/ui/Modal";
import { PageHead } from "@/modules/shell";
import { StatusBadge } from "@/shared/ui/Status";
import type { PolicyVersion } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { fmtDate, titleCase, todayISO } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/icons";
import { customPolicyState, policyState, useCore } from "@/modules/core-data";
import { notify } from "@/shared/lib/toast";
import { errorText } from "@/shared/lib/api";
import { POLICY_KEYS, POLICY_META, summarize } from "../utils/meta";
import { saveFirstVersion } from "../utils/setup";
import { policyTemplate } from "../utils/templates";
import {
  CustomPolicyDefForm,
  CustomValuesForm,
  formatCustomValue,
  type CustomPolicyDraft,
} from "../components/CustomPolicyEditor";

interface HistoryRow {
  id: string;
  policy: string;
  href: string;
  version: number;
  change: string;
  reason: string;
  effectiveFrom: string;
  by: string;
  createdAt: string;
  state: string;
}
const stateOf = (
  id: string,
  currentId: string,
  from: string,
  currentFrom: string,
) =>
  id === currentId
    ? "In force"
    : from > currentFrom
      ? "Scheduled"
      : "Superseded";

/** 3.1 Policies: every policy is versioned with an effective date and reason. */
export default function Policies() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "policies");
  const navigate = useNavigate();
  const policies = useCore((s) => s.policies);
  const customDefs = useCore((s) => s.customPolicies);
  const customVersions = useCore((s) => s.customVersions);
  const createCustom = useCore((s) => s.createCustomPolicyRemote);
  const savePolicyVersion = useCore((s) => s.savePolicyVersion);
  const saveHolidayRowsRemote = useCore((s) => s.saveHolidayRowsRemote);
  const saveShiftRowsRemote = useCore((s) => s.saveShiftRowsRemote);
  const [settingUp, setSettingUp] = useState(false);
  const [pick, setPick] = useState(false);
  // a new company has none of the six built-in policies yet: each can start from its standard template
  const unset = POLICY_KEYS.filter((key) => !policyState(policies, key).latest);
  const setUpRemaining = async () => {
    if (!window.confirm(`Set up ${unset.length} ${unset.length === 1 ? "policy" : "policies"} from the standard templates, effective today? You can change each one afterwards with a new version.`)) return;
    setSettingUp(true);
    const failed: string[] = [];
    for (const key of unset) {
      try {
        await saveFirstVersion({ savePolicyVersion, saveHolidayRowsRemote, saveShiftRowsRemote }, key, policyTemplate(key), todayISO(), "Set up from the standard template");
      } catch (err) {
        failed.push(`${POLICY_META[key].title}: ${errorText(err)}`);
      }
    }
    setSettingUp(false);
    const saved = unset.length - failed.length;
    notify(failed.length ? `${saved} of ${unset.length} set up. Not set up: ${failed.join("; ")}` : `${saved} ${saved === 1 ? "policy" : "policies"} set up from the standard templates`, failed.length ? 10000 : 3000);
  };
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<CustomPolicyDraft | null>(null);
  const closeCreate = (open: boolean) => {
    setCreating(open);
    if (!open) setDraft(null);
  };

  const builtIn: HistoryRow[] = policies.map((v: PolicyVersion) => {
    const { current } = policyState(policies, v.key);
    return {
      id: v.id,
      policy: POLICY_META[v.key].title,
      href: `/policies/${v.key}`,
      version: v.version,
      change: summarize(v.key, v.data),
      reason: v.reason,
      effectiveFrom: v.effectiveFrom,
      by: v.createdBy,
      createdAt: v.createdAt,
      state: stateOf(v.id, current.id, v.effectiveFrom, current.effectiveFrom),
    };
  });
  const custom: HistoryRow[] = customDefs.flatMap((d) => {
    const { versions, current } = customPolicyState(customVersions, d.id);
    return versions.map((v) => ({
      id: v.id,
      policy: d.name,
      href: `/policies/custom/${d.id}`,
      version: v.version,
      change: d.fields
        .slice(0, 2)
        .map((f) => `${f.label}: ${formatCustomValue(f, v.values[f.id])}`)
        .join(" · "),
      reason: v.reason,
      effectiveFrom: v.effectiveFrom,
      by: v.createdBy,
      createdAt: v.createdAt,
      state: stateOf(v.id, current.id, v.effectiveFrom, current.effectiveFrom),
    }));
  });
  const all = [...builtIn, ...custom].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const stateText = (r: HistoryRow) => r.state;

  return (
    <div ref={ref}>
      <PageHead
        crumb="Policies"
        title="Policies"
        desc="The updated version applies only from its effective date, while all historical payroll and attendance records remain unchanged."
        actions={
          <>
            {unset.length > 0 && (
              <Button icon="check" disabled={settingUp} onClick={() => void setUpRemaining()}>
                {settingUp ? "Setting up…" : `Set up ${unset.length === POLICY_KEYS.length ? "all" : "remaining"} from templates`}
              </Button>
            )}
            <Button icon="plus" onClick={() => setCreating(true)}>
              Create custom policy
            </Button>
            <Button tone="primary" icon="plus" onClick={() => setPick(true)}>
              New policy version
            </Button>
          </>
        }
      />
      <Modal
        open={creating}
        onOpenChange={closeCreate}
        title={draft ? `${draft.name}: first values` : "Create custom policy"}
        description={
          draft
            ? "Fill in the first version of this policy."
            : "Name the policy and define the fields it records."
        }
      >
        {!draft ? (
          <CustomPolicyDefForm onNext={setDraft} />
        ) : (
          <CustomValuesForm
            fields={draft.fields}
            submitLabel="Create policy"
            onBack={() => setDraft(null)}
            onSave={async (values, effectiveFrom, reason) => {
              let id: string;
              try {
                id = await createCustom(draft, { effectiveFrom, reason, values });
              } catch (err) {
                notify(`${draft.name}: not created. ${errorText(err)}`);
                return;
              }
              notify(
                `${draft.name} created, effective ${fmtDate(effectiveFrom)}`,
              );
              closeCreate(false);
              navigate(`/policies/custom/${id}`);
            }}
          />
        )}
      </Modal>
      <Modal
        open={pick}
        onOpenChange={setPick}
        title="Which policy is changing?"
        description="Pick a policy to start a new version"
      >
        <div className="radio-cards">
          {POLICY_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="radio-card pick-card"
              onClick={() => {
                setPick(false);
                navigate(`/policies/${key}?edit=1`);
              }}
            >
              <Icon name={POLICY_META[key].icon} />
              <div>
                <strong>{POLICY_META[key].title}</strong>
                <span>
                  {policyState(policies, key).current ? summarize(key, policyState(policies, key).current.data) : "Not set"}
                </span>
              </div>
            </button>
          ))}
        </div>
        <div className="form-actions">
          <Button onClick={() => setPick(false)}>Cancel</Button>
        </div>
      </Modal>
      <div
        className="grid policy-cards"
        style={{ marginBottom: 16 }}
      >
        {POLICY_KEYS.map((key) => {
          const { current, scheduled } = policyState(policies, key);
          const meta = POLICY_META[key];
          return (
            <Card
              key={key}
              title={
                <span
                  style={{
                    display: "inline-flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <Icon name={meta.icon} />
                  {titleCase(meta.title)}
                </span>
              }
              subtitle={meta.desc}
            >
              <div style={{ marginBottom: 10 }}>
                {current ? (
                  <Button
                    size="sm"
                    iconRight="arrowR"
                    onClick={() => navigate(`/policies/${key}`)}
                    aria-label={`Open ${meta.title}`}
                  >
                    Open
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    tone="primary"
                    icon="plus"
                    onClick={() => navigate(`/policies/${key}`)}
                    aria-label={`Set up ${meta.title}`}
                  >
                    Set up from template
                  </Button>
                )}
              </div>
              <strong style={{ display: "block", fontSize: 15 }}>
                {current ? summarize(key, current.data) : "Not set up yet"}
              </strong>
              <Muted>
                {current
                  ? `v${current.version}, in force since ${fmtDate(current.effectiveFrom)}`
                  : "Starts from a ready template you can change"}
                {scheduled.length ? ` · ${scheduled.length} scheduled` : ""}
              </Muted>
            </Card>
          );
        })}
        {customDefs.map((d) => {
          const { current, scheduled } = customPolicyState(
            customVersions,
            d.id,
          );
          return (
            <Card
              key={d.id}
              title={
                <span
                  style={{
                    display: "inline-flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <Icon name="scroll" />
                  {d.name}
                </span>
              }
              subtitle={d.description}
            >
              <div style={{ marginBottom: 10 }}>
                <Button
                  size="sm"
                  iconRight="arrowR"
                  onClick={() => navigate(`/policies/custom/${d.id}`)}
                  aria-label={`Open ${d.name}`}
                >
                  Open
                </Button>
              </div>
              <strong style={{ display: "block", fontSize: 15 }}>
                Custom policy · {d.fields.length} field
                {d.fields.length === 1 ? "" : "s"}
              </strong>
              <Muted>
                {`v${current.version}, in force since ${fmtDate(current.effectiveFrom)}`}
                {scheduled.length ? ` · ${scheduled.length} scheduled` : ""}
              </Muted>
            </Card>
          );
        })}
      </div>
      <TablePanel
        title="Version history"
        subtitle="Filter by status using the chips; pick more than one to combine. Search by policy, reason or author."
        rows={all}
        rowKey={(v) => v.id}
        columns={[
          {
            header: "Policy",
            kind: "c-id",
            cell: (v) => (
              <button
                type="button"
                className="id-link"
                onClick={() => navigate(v.href)}
              >
                {v.policy}
              </button>
            ),
            csv: (v) => v.policy,
          },
          {
            header: "Version",
            kind: "c-amt",
            cell: (v) => `v${v.version}`,
            csv: (v) => `v${v.version}`,
          },
          {
            header: "Change",
            kind: "c-sub",
            cell: (v) => (
              <>
                <strong>{v.change}</strong>
                <span className="sub">{v.reason}</span>
              </>
            ),
            csv: (v) => `${v.change} — ${v.reason}`,
          },
          {
            header: "Effective from",
            kind: "c-more",
            cell: (v) => fmtDate(v.effectiveFrom),
            csv: (v) => fmtDate(v.effectiveFrom),
          },
          { header: "By", kind: "c-more", cell: (v) => v.by, csv: (v) => v.by },
          {
            header: "State",
            kind: "c-status",
            cell: (v) => {
              const s = v.state;
              return (
                <StatusBadge
                  tone={
                    s === "In force"
                      ? "approved"
                      : s === "Scheduled"
                        ? "review"
                        : "draft"
                  }
                >
                  {s}
                </StatusBadge>
              );
            },
            csv: stateText,
          },
        ]}
        searchText={(v) => `${v.policy} ${v.reason} ${v.by}`}
        statusOf={stateText}
        exportName="core-policy-versions"
      />
    </div>
  );
}
