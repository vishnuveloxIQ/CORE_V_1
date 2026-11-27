import { useEffect, useRef, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { KV, Muted } from "@/shared/ui/Extras";
import { FormGroup, Input, Textarea } from "@/shared/ui/Field";
import { Modal } from "@/shared/ui/Modal";
import { StatusBadge } from "@/shared/ui/Status";
import { Icon } from "@/shared/ui/icons";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { PageHead } from "@/modules/shell";
import { useEnter } from "@/shared/hooks/useMotion";
import { a11y } from "@/shared/lib/core";
import { fmtDate, money } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { billingApi as billing, useCore, type BillingPlanRecord, type InvoiceRecord, type SubscriptionRecord } from "@/modules/core-data";
import { errorText } from "@/shared/lib/api";

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
  plans,
  current,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  plans: BillingPlanRecord[];
  current: string;
}) {
  const [pick, setPick] = useState("");
  const cell = {
    padding: "8px 10px",
    textAlign: "left",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
  } as const;
  const higher = plans.filter(
    (p) => p.price > (plans.find((x) => x.name === current)?.price ?? 0),
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
            {plans.map((p) => (
              <tr
                key={p.name}
                style={
                  p.name === current
                    ? { background: "var(--soft, rgba(26,115,232,.08))" }
                    : undefined
                }
              >
                <td style={cell}>
                  {p.name !== current &&
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
                      {p.name === current && (
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

const MESSAGE_WORD_LIMIT = 250;

/** The support message form, shown inline in the "We're Here to Help" card. */
function SupportForm({
  onSent,
  onCancel,
}: {
  onSent: () => void;
  onCancel?: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const words = message.trim() ? message.trim().split(/\s+/).length : 0;
  const send = () => {
    if (!subject.trim() || message.trim().length < 10)
      return setError(
        "Enter a subject and a message of at least 10 characters.",
      );
    if (words > MESSAGE_WORD_LIMIT)
      return setError(`Keep the message to ${MESSAGE_WORD_LIMIT} words or fewer.`);
    // TODO(backend): POST /support/messages { subject, message }
    notify("Your message has been sent to support.");
    setSubject("");
    setMessage("");
    setError("");
    onSent();
  };
  return (
    <>
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
        <FormGroup label="Message" required full error={error || undefined} helper={`${words}/${MESSAGE_WORD_LIMIT} words`}>
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
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <Button tone="primary" icon="check" onClick={send}>
          Send message
        </Button>
      </div>
    </>
  );
}

export default function Subscription() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "subscription");
  const { users } = useCore();
  const [upgrade, setUpgrade] = useState(false);
  const [renew, setRenew] = useState(false);
  const [data, setData] = useState<{
    sub: SubscriptionRecord | null;
    invoices: InvoiceRecord[];
    plans: BillingPlanRecord[];
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([billing.listSubscriptions(), billing.listInvoices(), billing.listBillingPlans()]).then(
      ([subs, invoices, plans]) => { if (live) setData({ sub: subs[0] ?? null, invoices, plans }); },
      (err: unknown) => { if (live) setLoadError(errorText(err)); },
    );
    return () => { live = false; };
  }, []);
  const S = data?.sub ?? null;
  const gst = S ? (S.baseAmount * S.gstRate) / 100 : 0;
  const daysLeft = S
    ? differenceInCalendarDays(new Date(S.renewalDate), new Date())
    : 0;

  return (
    <div ref={ref}>
      <PageHead
        crumb="Company setup"
        title="Subscription"
        desc="Company's current plan, usage limits, billing and invoices."
      />

      {loadError ? (
        <Card title="Subscription"><Muted>{loadError}</Muted></Card>
      ) : !data ? (
        <Card title="Subscription"><Muted>Loading the subscription…</Muted></Card>
      ) : !S ? (
        <Card title="Subscription"><Muted>No subscription is set up for this company yet.</Muted></Card>
      ) : (
      <>

      <Card
        title={`${S.plan} plan`}
        subtitle={`Subscription ${S.accountId}`}
        className="mb-16"
        action={
          <div className="form-actions" style={{ marginTop: 0 }}>
            <StatusBadge tone={TONE[S.status]}>{S.status}</StatusBadge>
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
          <KV k="Next Renewal Date">
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
            {S.limitUsers != null && <Usage label="Users" used={users.length} limit={S.limitUsers} />}
          </Card>
          <TablePanel
            title="Invoice history"
            subtitle="Sort as required."
            rows={data.invoices}
            rowKey={(i) => i.invoiceNo}
            columns={[
              {
                header: "Invoice",
                kind: "c-id",
                cell: (i) => i.invoiceNo,
                csv: (i) => i.invoiceNo,
              },
              {
                header: "Date",
                kind: "c-more",
                cell: (i) => fmtDate(i.invoiceDate),
                csv: (i) => i.invoiceDate,
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
            searchText={(i) => `${i.invoiceNo} ${i.period}`}
            searchPlaceholder="Search invoices…"
            exportName="core-invoices"
          />
        </div>
        <Card title="We're Here to Help" subtitle="Get help with your plan or reach out to our support team">
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 440 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <SupportForm onSent={() => undefined} />
            </div>
            <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", color: "var(--muted)" }}>
              <Icon name="handshake" size={64} />
            </div>
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
      <UpgradeModal open={upgrade} onOpenChange={setUpgrade} plans={data.plans} current={S.plan} />
      </>
      )}
    </div>
  );
}
