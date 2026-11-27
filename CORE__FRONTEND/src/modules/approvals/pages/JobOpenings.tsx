import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { PageHead } from "@/modules/shell";
import { StatTile } from "@/shared/ui/StatTile";
import { StatusBadge } from "@/shared/ui/Status";
import type { ApprovalRequest, RequestPayload } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { REQUEST_TONE, projectOf } from "@/modules/core-data";
import { fmtDate, money } from "@/shared/lib/format";
import { useCore } from "@/modules/core-data";
import { PublishJobDialog } from "../components/PublishJobDialog";
import { canPublishJob, isPublished, JOB_ROUTE_LABEL, jobRouteOf } from "../utils/jobs";
import { OfferLetterPanel } from "@/modules/company";

type Job = ApprovalRequest & {
  payload: Extract<RequestPayload, { kind: "job" }>;
};
const isJob = (r: ApprovalRequest): r is Job => r.payload.kind === "job";

/** PRD v2 §3.11 — job openings posted on the HRMS recruitment page; CORE decides who fills them and publishes Head Office openings to the location. */
export default function JobOpenings() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "job-openings");
  const navigate = useNavigate();
  const { requests, projects } = useCore();
  const offerLetter = useCore((s) => s.company.offerLetter);
  const [format, setFormat] = useState(false);
  const [publishing, setPublishing] = useState<Job | null>(null);
  const jobs = requests.filter(isJob);
  // an approved opening is ready to publish unless the project hires directly (POST /approval-requests/{id}/publish)
  const stage = (j: Job) =>
    j.status === "Pending" || j.status === "In review" || j.status === "Clarification requested"
      ? "Waiting for decision"
      : j.status === "Rejected"
        ? "Rejected"
        : isPublished(j)
          ? "Published"
          : canPublishJob(j)
            ? "Ready to publish"
            : "Project hiring";
  const publishedText = (j: Job) => (j.publishedAt ? fmtDate(j.publishedAt) : "");
  const STAGE_TONE = {
    "Waiting for decision": "pending",
    Rejected: "rejected",
    "Published": "approved",
    "Ready to publish": "review",
    "Project hiring": "approved",
  } as const;

  return (
    <div ref={ref}>
      <PageHead
        crumb="Job openings"
        title="Job openings"
        desc="Publish recruitment vacancies and define whether hiring is managed directly at the location or centrally by Head Office, which publishes openings and forwards shortlisted candidates."
        actions={
          <Button
            tone="primary"
            icon="fileCheck"
            onClick={() => setFormat(true)}
          >
            Offer letter format
          </Button>
        }
      />
      <div className="grid stats">
        <StatTile
          label="Pending Decision"
          value={jobs.filter((j) => stage(j) === "Waiting for decision").length}
          icon="clock"
          tone="gold"
        />
        <StatTile
          label="Direct Location Hiring"
          value={
            jobs.filter(
              (j) =>
                jobRouteOf(j) === "Site hires directly" &&
                j.status === "Approved",
            ).length
          }
          icon="mapPin"
          tone="blue"
        />
        <StatTile
          label="Awaiting Publication"
          value={jobs.filter((j) => stage(j) === "Ready to publish").length}
          icon="send"
          tone="rose"
        />
      </div>
      <TablePanel
        title="All job openings"
        subtitle="Filter by stage using the chips; pick more than one to combine. Approve an opening from its request page; publish Head Office openings here."
        rows={jobs}
        rowKey={(j) => j.id}
        columns={[
          {
            header: "Request",
            kind: "c-id",
            cell: (j) => (
              <button
                type="button"
                className="id-link"
                onClick={() => navigate(`/approvals/${j.id}`)}
              >
                {j.code}
              </button>
            ),
            csv: (j) => j.code,
          },
          {
            header: "Position",
            kind: "c-sub",
            cell: (j) => (
              <strong>
                {j.payload.position} × {j.payload.openings}
              </strong>
            ),
            csv: (j) => `${j.payload.position} x${j.payload.openings}`,
          },
          {
            header: "Project",
            kind: "c-more",
            cell: (j) => projectOf(projects, j.chainageId)?.name ?? j.chainageId,
            csv: (j) => projectOf(projects, j.chainageId)?.name ?? j.chainageId,
          },
          {
            header: "CTC range",
            kind: "c-amt",
            cell: (j) =>
              `${money(j.payload.ctcMin)} – ${money(j.payload.ctcMax)}`,
            csv: (j) => `${j.payload.ctcMin}-${j.payload.ctcMax}`,
          },
          {
            header: "Route",
            kind: "c-more",
            cell: (j) => { const r = jobRouteOf(j); return r ? JOB_ROUTE_LABEL[r] : "Not decided"; },
            csv: (j) => { const r = jobRouteOf(j); return r ? JOB_ROUTE_LABEL[r] : ""; },
          },
          {
            header: "Approval",
            kind: "c-more",
            cell: (j) => (
              <StatusBadge tone={REQUEST_TONE[j.status]}>
                {j.status}
              </StatusBadge>
            ),
            csv: (j) => j.status,
          },
          {
            header: "Raised",
            kind: "c-more",
            cell: (j) => fmtDate(j.raisedAt),
            csv: (j) => fmtDate(j.raisedAt),
          },
          {
            header: "Stage",
            kind: "c-status",
            cell: (j) => (
              <>
                <StatusBadge tone={STAGE_TONE[stage(j)]}>{stage(j)}</StatusBadge>
                {isPublished(j) && <span className="sub">{publishedText(j)}</span>}
              </>
            ),
            csv: (j) => (isPublished(j) ? `${stage(j)}: ${publishedText(j)}` : stage(j)),
          },
        ]}
        searchText={(j) =>
          `${j.code} ${j.payload.position} ${jobRouteOf(j) ?? ""}`
        }
        statusOf={stage}
        action={(j) =>
          stage(j) === "Ready to publish" ? (
            <Button
              size="sm"
              tone="success"
              icon="send"
              onClick={() => setPublishing(j)}
            >
              Publish
            </Button>
          ) : (
            <Button size="sm" onClick={() => navigate(`/approvals/${j.id}`)}>
              {stage(j) === "Waiting for decision" ? "Decide" : "View"}
            </Button>
          )
        }
        exportName="core-job-openings"
        chipNoun="stages"
      />
      <PublishJobDialog req={publishing} onClose={() => setPublishing(null)} />
      <Modal
        open={format}
        onOpenChange={setFormat}
        title="Offer letter format"
        description="Current offer letter format and how to replace it"
      >
        <p style={{ marginTop: 0, fontSize: 13.5 }}>
          {offerLetter ? (
            <>
              This is the current format HRMS uses for offer letters. Update it
              only if the wording has changed.
            </>
          ) : (
            <>
              No format is uploaded yet. HRMS cannot issue offer letters until
              there is one.
            </>
          )}
        </p>
        <OfferLetterPanel compact />
        <div className="form-actions">
          <Button onClick={() => setFormat(false)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}
