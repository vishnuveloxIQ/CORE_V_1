import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { z } from "zod";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { MiniTable } from "@/shared/ui/Extras";
import { FormGroup, Input, Select, Textarea } from "@/shared/ui/Field";
import { StatusBadge } from "@/shared/ui/Status";
import { useEnter } from "@/shared/hooks/useMotion";
import { a11y, req } from "@/shared/lib/core";
import { fmtDate } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { Icon } from "@/shared/ui/icons";
import { useCore } from "@/modules/core-data";
import { useRemoteSave } from "@/shared/hooks/useRemoteSave";
import { PageHead } from "@/modules/shell";

const FAQ: { q: string; a: string; tag: string }[] = [
  {
    tag: "Policies",
    q: "Why can’t I change a policy for last month?",
    a: "Every policy version applies from its effective date. Past payroll and attendance never change, so the earliest effective date is today.",
  },
  {
    tag: "Policies",
    q: "What does the payment threshold do?",
    a: "Advance payments below the threshold are paid by PMS. At or above it, Head Office approves and pays the payee directly.",
  },
  {
    tag: "Approvals",
    q: "Why is a request type marked “Not usable”?",
    a: "Its approval chain has no L1 approver. Set L1 in the approval matrix and the request type becomes available to the modules.",
  },
  {
    tag: "Approvals",
    q: "Does editing a chain change requests already raised?",
    a: "No. Each request keeps the matrix version it was raised under. Only new requests use the new version.",
  },
  {
    tag: "Approvals",
    q: "Can a module head approve their own request?",
    a: "No. Segregation of duties moves it to the next level automatically.",
  },
  {
    tag: "Approvals",
    q: "What happens when an approver is absent?",
    a: "Requests are never escalated. When a level's reminder interval passes, the same approver is reminded, and reminded again after each further interval, until they act. Nothing is decided automatically.",
  },
  {
    tag: "HR",
    q: "Who carries out a transfer, promotion, bonus or loan?",
    a: "HRMS raises and executes them. CORE only approves, through the approval matrix for that request type.",
  },
  {
    tag: "HR",
    q: "How are loans and advances routed?",
    a: "Like advance payments, until PRD v2 Q6 settles whether they are the same records: below the payment threshold the location pays through PMS; at or above it Head Office approves and pays.",
  },
  {
    tag: "Hiring",
    q: "What happens to a job opening after I approve it?",
    a: "If you chose “Site hires directly”, the location recruits. If you chose “Head Office posts and sends a candidate”, publish it to the location from Job openings.",
  },
  {
    tag: "Hiring",
    q: "Where is the offer letter format?",
    a: "In Company profile, under the logo, and from the Offer letter format button on Job openings. There is one format. Only the Tenant Admin replaces it; you see the current file first and choose to replace it or keep it.",
  },
  {
    tag: "Hiring",
    q: "Do offer letters still need approval?",
    a: "Yes. The format is set once, but every offer letter HRMS issues goes through the Offer letter chain in the approval matrix.",
  },
  {
    tag: "Grievances",
    q: "What does a grievance contain?",
    a: "Only its ID, the name of the person who raised it, a message of up to 10 words, and the date they want to visit Head Office. The rest is discussed at the visit.",
  },
  {
    tag: "Approvals",
    q: "Can a project or location have its own approval chain?",
    a: "Yes. Use New approval chain, pick the request type and choose the whole company, one or more projects, or one or more locations. A request uses the location chain first, then the project chain, then the company chain.",
  },
  {
    tag: "Grievances",
    q: "How do I handle a Head Office visit?",
    a: "Open the grievance and confirm the date, move it to another date with a reason, or after the day mark it visited or not visited. Each step is kept in its history.",
  },
  {
    tag: "Notifications",
    q: "Where does a notification take me?",
    a: "Straight to the page where your action is needed — the request, the grievance, the location geo-fence or the approval chain.",
  },
  {
    tag: "Bulk upload",
    q: "How do I add many records at once?",
    a: "Use Bulk upload on Projects, Locations, Stores, Materials, Users, Project equipment planning, holidays and chainage. Download the template, fill one row per record, and upload the CSV. Every row is checked first; only the good rows are added and you can download an error report for the rest.",
  },
  {
    tag: "Masters",
    q: "How do I draw a geo-fence?",
    a: "Open the location, go to Geo-fence and choose Edit. For a polygon, click the map to drop pins around the boundary (drag to move, right-click to remove) or type the points in. For a circle, click the centre and set the radius. For a road or canal, choose Linear, drop pins along the centre line and set the width each side. Saving needs step-up verification.",
  },
  {
    tag: "Security",
    q: "Why am I asked for a code again?",
    a: "Geo-fence changes, privilege grants and data exports need step-up verification with your authenticator app or passkey.",
  },
  {
    tag: "Users",
    q: "Where do module heads and approvers come from?",
    a: "They are created in CORE under Users — not taken from HRMS. Choose the role “Module head” (with privileges) or “High-level approver” (usable at any level of the approval matrix).",
  },
  {
    tag: "Users",
    q: "Can one person head more than one module?",
    a: "Yes. Tick every module they head. Each module still has only one active head, so a module that already has one must be freed first.",
  },
  {
    tag: "Users",
    q: "Are module users created in CORE?",
    a: "No. Module users are created in HRMS and managed by their module head.",
  },
  {
    tag: "Organisation",
    q: "How is the organogram built?",
    a: "From the roles. Each role belongs to a department and reports to another role; the organogram draws those reporting lines. Add or edit roles under Users and roles, or click a role on the organogram and use Add a role under it.",
  },
  {
    tag: "Organisation",
    q: "Why can I not deactivate a department or role?",
    a: "A department with active roles, or a role that others still report to, would leave gaps in the structure. Move those roles first, then deactivate.",
  },
  {
    tag: "Masters",
    q: "Can other modules edit locations, stores or materials?",
    a: "No. Master data is created and changed only in CORE. Other modules read it.",
  },
  {
    tag: "Equipment",
    q: "Why is equipment location shown as sample data?",
    a: "The GPS device has not been decided and the P&M location API is not specified, so positions are sample data. Live location arrives in Release 2.",
  },
  {
    tag: "Troubleshooting",
    q: "Why was I signed out?",
    a: "Your session ended: it expired, you signed in on another device (each person has one active session), or an administrator ended it. Sign in again. Anything you had typed but not saved is not kept, so copy long text before you step away.",
  },
  {
    tag: "Troubleshooting",
    q: "It says someone else changed this. What do I do?",
    a: "Another person saved the same record after you opened it. Core loads their version so nothing is overwritten: check it, make your change again and save. For an approval, the request may already have moved to the next level or been decided.",
  },
  {
    tag: "Troubleshooting",
    q: "A banner says Core cannot reach the server, or is being updated.",
    a: "Your last change may not have been saved. Wait a moment, choose Check again, then open the record to see whether your change is there before trying again.",
  },
  {
    tag: "Troubleshooting",
    q: "An error shows a reference. What is it for?",
    a: "Quote the reference when you contact support. It identifies your request in the server logs, so the problem can be found without you describing every step.",
  },
];

const schema = z.object({
  subject: req("Subject").max(120, "Keep it under 120 characters."),
  category: req("Category"),
  priority: z.enum(["Low", "Medium", "High"]),
  description: z
    .string()
    .trim()
    .min(20, "Describe the problem in at least 20 characters."),
});
const CATEGORIES = [
  "Company setup and policies",
  "Projects and locations",
  "Stores and stock",
  "Equipment",
  "Users and access",
  "Organisation",
  "Approval matrix",
  "Grievances",
  "Bulk upload",
  "Something else",
];

/** 3.10 Help and support — CORE only: searchable FAQ and a ticket form. */
export default function Help() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "help");
  const { tickets, addTicket } = useCore();
  // POST /tickets; nothing is kept in the browser when the server refuses it
  const { run, error: saveError, saving } = useRemoteSave();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const faqs = FAQ.filter(
    (f) => !query || `${f.q} ${f.a} ${f.tag}`.toLowerCase().includes(query),
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors: e },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      subject: "",
      category: CATEGORIES[0],
      priority: "Medium" as const,
      description: "",
    },
  });
  const submit = handleSubmit(async (v) => {
    const code = await run(v, (key) => addTicket(v, key));
    if (!code) return;
    reset();
    notify(`Ticket ${code} raised. We reply by email.`);
  });

  return (
    <div ref={ref}>
      <PageHead
        crumb="Help and support"
        title="Help and support"
        desc="Answers about CORE, or raise a ticket with the support team."
      />
      <div className="grid dash-grid">
        <Card
          title="Frequently asked questions"
          subtitle={`${faqs.length} of ${FAQ.length} shown`}
        >
          <div className="search-wrap" style={{ marginBottom: 8 }}>
            <Icon name="search" />
            <input
              className="field"
              value={q}
              onChange={(ev) => setQ(ev.target.value)}
              placeholder="Search help…"
              aria-label="Search help"
            />
          </div>
          {faqs.length ? (
            faqs.map((f) => (
              <details className="faq-row" key={f.q}>
                <summary>
                  <span>
                    {f.q}{" "}
                    <span className="cell-pill" style={{ marginLeft: 6 }}>
                      {f.tag}
                    </span>
                  </span>
                </summary>
                <p>{f.a}</p>
              </details>
            ))
          ) : (
            <EmptyState icon="search" title="No answers match">
              Try other words, or raise a ticket.
            </EmptyState>
          )}
        </Card>
        <div className="stack" style={{ alignSelf: "start" }}>
          <Card
            title="Raise a ticket"
            subtitle="Use this form to communicate your concerns to the Support Team."
          >
            <form id="ticket-form" noValidate onSubmit={submit}>
              {saveError && (
                <div className="login-error" role="alert" style={{ marginBottom: 14 }}>
                  <span>{saveError}</span>
                </div>
              )}
              <div className="form-grid">
                <FormGroup
                  label="Subject"
                  required
                  full
                  error={e.subject?.message}
                >
                  {(id, d) => (
                    <Input
                      {...a11y(id, d, e.subject?.message)}
                      {...register("subject")}
                    />
                  )}
                </FormGroup>
                <FormGroup label="Category" required>
                  {(id) => (
                    <Select id={id} {...register("category")}>
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  )}
                </FormGroup>
                <FormGroup label="Priority" required>
                  {(id) => (
                    <Select id={id} {...register("priority")}>
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </Select>
                  )}
                </FormGroup>
                <FormGroup
                  label="Description"
                  required
                  full
                  error={e.description?.message}
                  helper="Describe the issue, including the screen, the record ID and the result you expected."
                >
                  {(id, d) => (
                    <Textarea
                      rows={4}
                      {...a11y(id, d, e.description?.message)}
                      {...register("description")}
                    />
                  )}
                </FormGroup>
              </div>
              <div className="form-actions">
                <Button type="submit" tone="success" icon="check" disabled={saving}>
                  Send ticket
                </Button>
              </div>
            </form>
          </Card>
          <Card title="Your tickets">
            <MiniTable
              head={["Ticket", "Subject", "Raised", "Status"]}
              empty="No tickets yet."
              rows={tickets.map((t) => [
                <strong key="i">{t.code}</strong>,
                t.subject,
                fmtDate(t.createdAt),
                <StatusBadge
                  key="s"
                  tone={
                    t.status === "Open"
                      ? "pending"
                      : t.status === "Answered"
                        ? "review"
                        : "draft"
                  }
                >
                  {t.status}
                </StatusBadge>,
              ])}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
