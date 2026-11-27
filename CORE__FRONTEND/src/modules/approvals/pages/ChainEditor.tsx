import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useFieldArray, useWatch } from 'react-hook-form';
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { KV, MiniTable, Muted, Note, VersionFields } from "@/shared/ui/Extras";
import { PageHead } from "@/modules/shell";
import { StatusBadge } from "@/shared/ui/Status";
import type { ApprovalChain } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { byId } from "@/shared/lib/core";
import { scopeText } from "@/modules/core-data";
import { fmtDate, fmtDateTime, todayISO } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { useRemoteSave } from "@/shared/hooks/useRemoteSave";
import { chainState, REASON_MIN, REASON_TOO_SHORT, useCore } from "@/modules/core-data";
import { LevelFields } from "../components/LevelFields";
import { blankLevel, blankLevels, versionSchema, withLastLevelRules } from "../utils/schema";

const RULES = [
  "A project chain wins over the company chain.",
  "Level 1 must be set before the request type can be used.",
  "Each request moves through the set levels in order, from L1 up to the last level set.",
  "Requests are never escalated: when a level's reminder interval passes, the same approver is reminded again.",
  "Nothing is approved or rejected automatically on timeout.",
  "The emergency flag never bypasses approval.",
  "A raiser can never approve their own request; it moves to the next level.",
];

/** One chain: the version in force first; Edit chain saves a new matrix version. */
export default function ChainEditor() {
  const ref = useRef<HTMLDivElement>(null);
  const { id = "" } = useParams();
  useEnter(ref, `chain-${id}`);
  const navigate = useNavigate();
  const chain = useCore((s) => s.chains.find((c) => c.id === id));
  const users = useCore((s) => s.users);
  const projects = useCore((s) => s.projects);
  const [params] = useSearchParams();
  const [editing, setEditing] = useState(params.get("edit") === "1");
  const back = (
    <Button icon="chevL" onClick={() => navigate("/approval-matrix")}>
      Back to matrix
    </Button>
  );
  if (!chain) {
    return (
      <div ref={ref}>
        <PageHead
          crumb="Approval matrix"
          title="Chain not found"
          desc={`No approval chain with ID ${id}.`}
          actions={back}
        />
        <Card>
          <EmptyState icon="workflow" title="Nothing to show">
            Go back to the approval matrix.
          </EmptyState>
        </Card>
      </div>
    );
  }
  const { current, latest, ready } = chainState(chain);
  const nameOf = (aid: string) => {
    const u = byId(users, aid);
    return u ? `${u.name} (${u.loginId})` : "Unknown";
  };
  const isPayments = chain.requestType === "Payments";
  return (
    <div ref={ref}>
      <PageHead
        crumb={`${chain.requestType} · ${chain.id}`}
        title={chain.requestType}
        desc={`Chain ${chain.id} applies to ${scopeText(chain.scopeType, chain.scopeIds, projects)}. Raised by ${chain.raisedBy} in ${chain.module}.`}
        actions={
          <>
            {back}
            {!editing && (
              <Button
                tone="primary"
                icon="pencil"
                onClick={() => setEditing(true)}
              >
                {ready ? "Edit chain" : "Set up chain"}
              </Button>
            )}
          </>
        }
      />
      <div className="form-layout">
        <div className="stack">
        {editing ? (
          <Card
            title="New chain version"
            subtitle={`Starts from v${latest.version}. Requests already submitted keep their version.`}
            action={
              <Button size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            }
          >
            <ChainForm
              key={latest.version}
              chain={chain}
              onSaved={() => setEditing(false)}
            />
          </Card>
        ) : (
          <Card
            title={`In force: v${current.version}`}
            subtitle={`Since ${fmtDate(current.effectiveFrom)} · ${current.updatedBy} · “${current.reason}”`}
          >
            {!ready && (
              <Note title="Not usable yet" icon="ban" className="mt-0">
                Level 1 has no approver, so modules cannot raise this request
                type. Use Set up chain.
              </Note>
            )}
            <div className="detail-grid" style={{ marginBottom: 14 }}>
              <KV k="Applies to">
                <strong>
                  {chain.scopeType === "Company"
                    ? "Whole company"
                    : chain.scopeIds
                        .map((x) => byId(projects, x)?.name ?? x)
                        .join(", ")}
                </strong>
              </KV>
              <KV k="Scope">
                <span className="cell-pill">{chain.scopeType}</span>
              </KV>
            </div>
            <MiniTable
              head={[
                "Level",
                "Approver",
                "Remind every",
                "If the approver has not acted",
                ...(isPayments ? ["Cash limit (₹)"] : []),
              ]}
              rows={current.levels.map((l, i) => [
                <strong key="t">
                  Level {i + 1}
                  {i === 0 ? " (required)" : ""}
                </strong>,
                l.approverId ? (
                  <strong key="a">{nameOf(l.approverId)}</strong>
                ) : (
                  <Muted key="a">Not set</Muted>
                ),
                l.approverId ? `${l.timeoutHours} h` : "—",
                l.approverId ? "Reminded again at each interval (never escalated)" : "—",
                ...(isPayments
                  ? [
                      l.approverId && l.cashLimit
                        ? `Up to ₹${l.cashLimit.toLocaleString("en-IN")}`
                        : l.approverId
                          ? "No limit"
                          : "—",
                    ]
                  : []),
              ])}
            />
            {latest.version !== current.version && (
              <p style={{ margin: "14px 0 0", fontSize: 13 }}>
                <StatusBadge tone="review">Scheduled</StatusBadge> v
                {latest.version} applies from {fmtDate(latest.effectiveFrom)}.
              </p>
            )}
          </Card>
        )}
        {!editing && (
          <Card title="Rules" subtitle="How approvals move through the levels">
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              {RULES.map((r) => (
                <li
                  key={r}
                  style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5, color: "var(--ink-2)" }}
                >
                  <span
                    aria-hidden
                    style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: 0.5, marginTop: 7, flex: "none" }}
                  />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        </div>
        <div className="stack">
          <Card
            title="Versions"
            subtitle={`In force today: v${current.version}`}
          >
            <div className="timeline">
              {[...chain.versions].reverse().map((v) => {
                const st =
                  v.version === current.version
                    ? "In force"
                    : v.effectiveFrom > current.effectiveFrom
                      ? "Scheduled"
                      : "Superseded";
                return (
                  <div className="step" key={v.version}>
                    <div className="step-n">v{v.version}</div>
                    <div>
                      <strong>
                        {v.levels.filter((l) => l.approverId).length}{" "}
                        {v.levels.filter((l) => l.approverId).length === 1 ? "level" : "levels"} from{" "}
                        {fmtDate(v.effectiveFrom)}
                      </strong>
                      <span style={{ display: "block" }}>
                        {v.updatedBy} · “{v.reason}”
                      </span>
                      <span style={{ display: "block" }}>
                        Created {fmtDateTime(v.updatedAt)}
                      </span>
                      <StatusBadge
                        tone={
                          st === "In force"
                            ? "approved"
                            : st === "Scheduled"
                              ? "review"
                              : "draft"
                        }
                      >
                        {st}
                      </StatusBadge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ChainForm({
  chain,
  onSaved,
}: {
  chain: ApprovalChain;
  onSaved: () => void;
}) {
  const addChainVersion = useCore((s) => s.addChainVersion);
  const loadChains = useCore((s) => s.loadChains);
  // the version, its levels and the publish are written to the API; the chains are re-read afterwards
  const { run, error: saveError, saving } = useRemoteSave(loadChains);
  const { latest } = chainState(chain);
  // the levels the server holds for the latest version, however many (1 to 20); an empty version starts with one
  const defaults = {
    levels: latest.levels.length
      ? withLastLevelRules(
          latest.levels.map((l) => ({
            approverId: l.approverId,
            timeoutHours: l.timeoutHours,
            onTimeout: l.onTimeout,
            escalateToId: l.escalateToId,
            cashLimit: chain.requestType === "Payments" ? l.cashLimit : undefined,
          })),
        )
      : blankLevels(1),
    effectiveFrom: todayISO(),
    reason: "",
  };
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(versionSchema),
    defaultValues: defaults,
  });
  const levels = useWatch({ control, name: "levels" });
  const { append, remove } = useFieldArray({ control, name: "levels" });

  const submit = handleSubmit(async ({ levels, effectiveFrom, reason }) => {
    // changing an existing chain version needs a reason
    if (reason.trim().length < REASON_MIN) {
      notify(`${chain.requestType}: not saved. ${REASON_TOO_SHORT}`, 8000);
      return;
    }
    const clean = withLastLevelRules(
      levels.map((l) => ({
        ...l,
        cashLimit: chain.requestType === "Payments" ? l.cashLimit : undefined,
        escalateToId: l.escalateToId || undefined,
      })),
    );
    const v = { levels: clean, effectiveFrom, reason };
    const done = await run(v, () => addChainVersion(chain.id, v).then(() => true));
    if (!done) return;
    notify(
      `${chain.requestType}: v${latest.version + 1} saved, effective ${fmtDate(effectiveFrom)}`,
    );
    onSaved();
  });

  return (
    <form noValidate onSubmit={submit}>
      {saveError && (
        <div className="login-error" role="alert" style={{ marginBottom: 14 }}>
          <span>{saveError}</span>
        </div>
      )}
      <LevelFields
        register={register}
        errors={errors}
        levels={levels}
        cashLimit={chain.requestType === "Payments"}
        onAdd={() => append(blankLevel(levels.length))}
        onRemove={() => remove(levels.length - 1)}
      />
      <div className="form-grid" style={{ marginTop: 18 }}>
        <VersionFields register={register} errors={errors} />
      </div>
      <Note title="Existing requests" icon="lock">
        Requests already submitted stay on the version they started with. Only
        new requests use this one.
      </Note>
      <div className="form-actions">
        <Button onClick={() => reset(defaults)}>Reset</Button>
        <Button type="submit" tone="primary" icon="check" disabled={saving}>
          {saving ? "Saving…" : "Save Configuration"}
        </Button>
      </div>
    </form>
  );
}
