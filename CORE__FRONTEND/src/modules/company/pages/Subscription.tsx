import { useRef, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { KV, Muted, Note } from "@/shared/ui/Extras";
import { FormGroup, Input, Textarea } from "@/shared/ui/Field";
import { Modal } from "@/shared/ui/Modal";
import { StatusBadge } from "@/shared/ui/Status";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { PageHead } from "@/modules/shell";
import { useEnter } from "@/shared/hooks/useMotion";
import { a11y } from "@/shared/lib/core";
import { fmtDate, money } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { useCore } from "@/modules/core-data";
import { INVOICES, PLANS, SUBSCRIPTION as S } from "../data/subscription";

const TONE = {
  Active: "approved",
  Trial: "review",
  Expired: "rejected",
} as const;

function Usage({
  label,
  used,
  limit,
  unit = "",
}: {
  label: string;
  used: number;
  limit: number;
  unit?: string;
}) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          marginBottom: 6,
        }}
      >
        <strong>{label}</strong>
        <span>
          {used}
          {unit} of {limit}
          {unit}
        </span>
      </div>
      <div
        className="meter"
        role="progressbar"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Compares every plan; the current one is highlighted. */
function UpgradeModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [pick, setPick] = useState("");
  const cell = {
    padding: "8px 10px",
    textAlign: "left",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
  } as const;
  const higher = PLANS.filter(
    (p) => p.price > (PLANS.find((x) => x.name === S.plan)?.price ?? 0),
  );
  const request = () => {
    // TODO(backend): POST /billing/subscription/upgrade-requests { plan }
    notify(
      `Upgrade to ${pick} requested. Your account manager will contact you.`,
    );
    onOpenChange(false);
    setPick("");
  };
  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPick("");
      }}
      title="Upgrade plan"
      description="Compare plans and request an upgrade"
    >
      <div className="table-wrap">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cell}>Plan</th>
              <th style={cell}>Per year</th>
              <th style={cell}>Users</th>
              <th style={cell}>Projects</th>
              <th style={cell}>Locations</th>
              <th style={cell}>Storage</th>
              <th style={cell}>Support</th>
            </tr>
          </thead>
          <tbody>
            {PLANS.map((p) => (
              <tr
                key={p.name}
                style={
                  p.name === S.plan
                    ? { background: "var(--soft, rgba(26,115,232,.08))" }
                    : undefined
                }
              >
                <td style={cell}>
                  {p.name !== S.plan &&
                  higher.some((h) => h.name === p.name) ? (
                    <label
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      <input
                        type="radio"
                        name="plan"
                        checked={pick === p.name}
                        onChange={() => setPick(p.name)}
                      />
                      <strong>{p.name}</strong>
                    </label>
                  ) : (
                    <>
                      <strong>{p.name}</strong>
                      {p.name === S.plan && (
                        <>
                          {" "}
                          <StatusBadge tone="approved">Current</StatusBadge>
                        </>
                      )}
                    </>
                  )}
                </td>
                <td style={cell}>{money(p.price)}</td>
                <td style={cell}>{p.users}</td>
                <td style={cell}>{p.projects}</td>
                <td style={cell}>{p.sites}</td>
                <td style={cell}>{p.storageGb} GB</td>
                <td style={cell}>{p.support}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Muted>
        Prices exclude GST. Your account manager confirms the final amount
        before the change.
      </Muted>
      <div className="form-actions">
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          tone="primary"
          icon="arrowUp"
          disabled={!pick}
          onClick={request}
        >
          Request upgrade
        </Button>
      </div>
    </Modal>
  );
}

function SupportModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setSubject("");
      setMessage("");
      setError("");
    }
  };
  const send = () => {
    if (!subject.trim() || message.trim().length < 10)
      return setError(
        "Enter a subject and a message of at least 10 characters.",
      );
    // TODO(backend): POST /support/messages { subject, message }
    notify("Your message has been sent to support.");
    close(false);
  };
  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Contact support"
      description="Send a message to the support team"
    >
      <div className="form-grid">
        <FormGroup label="Subject" required full>
          {(id, d) => (
            <Input
              placeholder="Enter subject"
              {...a11y(id, d)}
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setError("");
              }}
            />
          )}
        </FormGroup>
        <FormGroup label="Message" required full error={error || undefined}>
          {(id, d) => (
            <Textarea
              rows={4}
              placeholder="Enter your message"
              {...a11y(id, d, error)}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setError("");
              }}
            />
          )}
        </FormGroup>
      </div>
      <div className="form-actions">
        <Button onClick={() => close(false)}>Cancel</Button>
        <Button tone="primary" icon="check" onClick={send}>
          Send message
        </Button>
      </div>
    </Modal>
  );
}

export default function Subscription() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "subscription");
  const { users, projects, sites } = useCore();
  const [upgrade, setUpgrade] = useState(false);
  const [renew, setRenew] = useState(false);
  const [support, setSupport] = useState(false);
  const gst = (S.baseAmount * S.gstRate) / 100;
  const daysLeft = differenceInCalendarDays(
    new Date(S.renewalDate),
    new Date(),
  );

  return (
    <div ref={ref}>
      <PageHead
        crumb="Company setup"
        title="Subscription"
        desc="Company's current plan, usage limits, billing and invoices."
      />

      <Card
        title={`${S.plan} plan`}
        subtitle={`Subscription ${S.accountId}`}
        className="mb-16"
        action={
          <div className="form-actions" style={{ marginTop: 0 }}>
            <StatusBadge tone={TONE.Active}>Active</StatusBadge>
            <Button icon="refresh" onClick={() => setRenew(true)}>
              Renew
            </Button>
            <Button
              tone="primary"
              icon="arrowUp"
              onClick={() => setUpgrade(true)}
            >
              Upgrade Plan
            </Button>
          </div>
        }
      >
        <div className="detail-grid">
          <KV k="Total per year">
            <strong>{money(S.baseAmount + gst)}</strong>
            <Muted> incl. GST ({S.gstRate}%)</Muted>
          </KV>
          <KV k="Renews on">
            <strong>{fmtDate(S.renewalDate)}</strong>
            <Muted> · {daysLeft} days</Muted>
          </KV>
          <KV k="Auto-renew">{S.autoRenew ? "On" : "Off"}</KV>
          <KV k="Account manager">{S.accountManager}</KV>
          <KV k="Payment method">{S.paymentMethod}</KV>
          <KV k="Invoices sent to">{S.billingEmail}</KV>
          <KV k="Enabled modules" full>
            {S.modules.join(", ")}
          </KV>
        </div>
      </Card>

      <div className="grid dash-grid">
        <div className="stack">
          <Card title="Usage against plan limits">
            <Usage label="Users" used={users.length} limit={S.limits.users} />
            <Usage
              label="Projects"
              used={projects.length}
              limit={S.limits.projects}
            />
            <Usage
              label="Locations"
              used={sites.length}
              limit={S.limits.sites}
            />
            <Usage
              label="Storage"
              used={86}
              limit={S.limits.storageGb}
              unit=" GB"
            />
          </Card>
          <TablePanel
            title="Invoice history"
            subtitle="Search by invoice number or period. Invoices issued for this subscription."
            rows={INVOICES}
            rowKey={(i) => i.no}
            columns={[
              {
                header: "Invoice",
                kind: "c-id",
                cell: (i) => i.no,
                csv: (i) => i.no,
              },
              {
                header: "Date",
                kind: "c-more",
                cell: (i) => fmtDate(i.date),
                csv: (i) => i.date,
              },
              {
                header: "For",
                kind: "c-sub",
                cell: (i) => i.period,
                csv: (i) => i.period,
              },
              {
                header: "Amount (incl. GST)",
                kind: "c-amt",
                cell: (i) => money(i.amount),
                csv: (i) => String(i.amount),
              },
              {
                header: "Status",
                kind: "c-status",
                cell: (i) => (
                  <StatusBadge
                    tone={i.status === "Paid" ? "approved" : "pending"}
                  >
                    {i.status}
                  </StatusBadge>
                ),
                csv: (i) => i.status,
              },
            ]}
            searchText={(i) => `${i.no} ${i.period}`}
            searchPlaceholder="Search invoices…"
            exportName="core-invoices"
          />
        </div>
        <Card title="We're Here to Help" subtitle="Get help with your plan or reach out to our support team">
          <div className="stack" style={{ gap: 10 }}>
            <Note title="Support" icon="help" className="mt-0">
              {S.supportTier}
            </Note>
            <Button icon="help" onClick={() => setSupport(true)}>
              Contact Support
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        open={renew}
        onOpenChange={setRenew}
        title="Renew subscription"
        description={`Current term ends ${fmtDate(S.renewalDate)}`}
      >
        <Muted>
          Your account manager will confirm the renewal and send the invoice to{" "}
          {S.billingEmail}.
        </Muted>
        <div className="form-actions">
          <Button onClick={() => setRenew(false)}>Cancel</Button>
          <Button
            tone="primary"
            icon="check"
            onClick={() => {
              // TODO(backend): POST /billing/subscription/renewals
              notify(
                "Renewal requested. Your account manager will contact you.",
              );
              setRenew(false);
            }}
          >
            Request renewal
          </Button>
        </div>
      </Modal>
      <UpgradeModal open={upgrade} onOpenChange={setUpgrade} />
      <SupportModal open={support} onOpenChange={setSupport} />
    </div>
  );
}
