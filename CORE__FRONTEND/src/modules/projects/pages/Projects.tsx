import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BulkUpload, type RowCheck } from "@/shared/ui/data/BulkUpload";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Button } from "@/shared/ui/Button";
import { PageHead } from "@/modules/shell";
import { StatTile } from "@/shared/ui/StatTile";
import { StatusBadge } from "@/shared/ui/Status";
import { useEnter } from "@/shared/hooks/useMotion";
import type { Project } from "@/modules/core-data";
import { bulk } from "@/shared/lib/bulk";
import { PROJECT_TONE } from "@/modules/core-data";
import { fmtDate, money } from "@/shared/lib/format";
import { newId, useCore } from "@/modules/core-data";
import { projectSchema } from "../utils/project/schema";
import { Note } from "@/shared/ui/Extras";
import { errorText } from "@/shared/lib/api";
import { notify } from "@/shared/lib/toast";
import { Can, MANAGE } from '@/modules/auth';

/** 3.2 Projects master. */
export default function Projects() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "projects");
  const navigate = useNavigate();
  const { projects, projectsLoad, projectsError, loadProjects, createProjectRemote } = useCore();
  const [upload, setUpload] = useState(false);
  /** Saves each row with POST /projects, one after the other, and reports any rows the server refused. */
  const importAll = async (list: Project[]) => {
    const failed: string[] = [];
    for (const p of list) {
      try {
        await createProjectRemote({ code: p.code, name: p.name, client: p.client, startDate: p.startDate, endDate: p.endDate, status: p.status, value: p.value, description: p.description });
      } catch (err) {
        failed.push(`${p.code}: ${errorText(err)}`);
      }
    }
    const saved = list.length - failed.length;
    notify(
      failed.length
        ? `${saved} of ${list.length} projects saved. Not saved: ${failed.join("; ")}`
        : `${saved} project${saved === 1 ? "" : "s"} saved`,
      failed.length ? 10000 : 2800,
    );
  };
  const open = (id: string) => navigate(`/projects/${id}`);
  const validate = (records: Record<string, string>[]): RowCheck<Project>[] => {
    const dup = bulk.dupes(records.map((r) => r.code));
    return records.map((r) => {
      const codeV = (r.code ?? "").toUpperCase();
      const status = bulk.pick(r.status || "Planning", [
        "Planning",
        "Active",
        "On hold",
        "Completed",
      ] as const);
      const value = {
        code: codeV,
        name: r.name ?? "",
        client: r.client ?? "",
        startDate: r.start_date ?? "",
        endDate: r.end_date ?? "",
        status: status ?? "Planning",
        value: bulk.num(r.contract_value ?? ""),
        description: r.description ?? "",
      };
      const errors = bulk.check(projectSchema, value);
      if (value.startDate && !bulk.date(value.startDate))
        errors.push("start_date must be a date like 2027-01-15.");
      if (value.endDate && !bulk.date(value.endDate))
        errors.push("end_date must be a date like 2028-03-31.");
      if (!status)
        errors.push("status must be Planning, Active, On hold or Completed.");
      if (projects.some((p) => p.code === codeV))
        errors.push(`Project ID ${codeV} already exists.`);
      else if (dup.has(codeV))
        errors.push(`Code ${codeV} appears twice in the file.`);
      const label = `${codeV || "?"} · ${r.name || "no name"}`;
      return errors.length
        ? { label, errors }
        : {
            label,
            value: {
              ...value,
              id: newId(),
              milestones: [],
              wbs: [],
              plan: {
                startDate: "",
                endDate: "",
                peakWorkforce: 0,
                workingDays: "Mon–Sat",
                notes: "",
              },
              zones: [],
              chainage: { startKm: 0, endKm: 0, markers: [] },
              locationIds: [],
            },
          };
    });
  };

  return (
    <div ref={ref}>
      <PageHead
        crumb="Projects"
        title="Projects"
        desc="View and manage projects, with their milestones, work breakdown structure."
        actions={
          <>
            <Can privilege={MANAGE.projects}>
              <Button icon="upload" onClick={() => setUpload(true)}>
                Bulk upload
              </Button>
              <Button
                tone="primary"
                icon="plus"
                onClick={() => navigate("/projects/new")}
              >
                New project
              </Button>
            </Can>
          </>
        }
      />
      {projectsLoad === "error" && (
        <Note title="Projects could not be loaded from the server" icon="alert">
          {projectsError}{" "}
          <Button size="sm" icon="refresh" onClick={() => void loadProjects()}>
            Try again
          </Button>
        </Note>
      )}
      <div className="grid stats">
        <StatTile
          label="Total projects"
          value={projects.length}
          icon="hardhat"
          tone="blue"
        />
        <StatTile
          label="Active projects"
          value={projects.filter((p) => p.status === "Active").length}
          icon="activity"
          tone="green"
        />
        <StatTile
          label="Completed projects"
          value={projects.filter((p) => p.status === "Completed").length}
          icon="checkc"
          tone="gold"
        />
      </div>
      <TablePanel
        title="All projects"
        subtitle="Filter by status using the chips; pick more than one to combine. Search by code, name or client. Open a project to manage Project details, milestones, WBS and locations."
        rows={projects}
        rowKey={(p) => p.id}
        columns={[
          {
            header: "Project ID",
            kind: "c-id",
            cell: (p) => (
              <button
                type="button"
                className="id-link"
                onClick={() => open(p.id)}
              >
                {p.code}
              </button>
            ),
            csv: (p) => p.code,
          },
          {
            header: "Project/Client",
            kind: "c-sub",
            cell: (p) => (
              <>
                <strong>{p.name}</strong>
                <span className="sub">{p.client}</span>
              </>
            ),
            csv: (p) => `${p.name} (${p.client})`,
          },
          {
            header: "Value",
            kind: "c-amt",
            cell: (p) => money(p.value),
            csv: (p) => String(p.value),
          },
          {
            header: "Time-Peroid",
            kind: "c-more",
            cell: (p) => `${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}`,
            csv: (p) => `${p.startDate} to ${p.endDate}`,
          },
          {
            header: "Locations",
            kind: "c-more",
            cell: (p) => `${p.locationIds.length} assigned`,
            csv: (p) => String(p.locationIds.length),
          },
          {
            header: "Status",
            kind: "c-status",
            cell: (p) => (
              <StatusBadge tone={PROJECT_TONE[p.status]}>
                {p.status}
              </StatusBadge>
            ),
            csv: (p) => p.status,
          },
        ]}
        searchText={(p) => `${p.code} ${p.name} ${p.client}`}
        statusOf={(p) => p.status}
        action={(p) => (
          <Button size="sm" onClick={() => open(p.id)}>
            Open
          </Button>
        )}
        searchPlaceholder="Search by code, name or client…"
        exportName="core-projects"
        chipNoun="statuses"
      />
      <BulkUpload
        open={upload}
        onOpenChange={setUpload}
        noun="projects"
        templateName="core-projects-template"
        fields={[
          {
            key: "code",
            label: "Project ID",
            required: true,
            example: "RD-SRK",
            hint: "Capitals, digits and hyphens",
          },
          {
            key: "name",
            label: "Project name",
            required: true,
            example: "Srikakulam bypass road",
          },
          {
            key: "client",
            label: "Client",
            required: true,
            example: "State Roads Department",
          },
          {
            key: "start_date",
            label: "Start date",
            required: true,
            example: "2027-02-01",
            hint: "yyyy-mm-dd",
          },
          {
            key: "end_date",
            label: "End date",
            required: true,
            example: "2028-06-30",
            hint: "yyyy-mm-dd, after the start",
          },
          {
            key: "contract_value",
            label: "Contract value in rupees",
            required: true,
            example: "1250000000",
          },
          {
            key: "status",
            label: "Status (optional)",
            example: "Planning",
            hint: "Active or Completed (Planning and On hold are saved as Active)",
          },
          {
            key: "description",
            label: "Description (optional)",
            example: "22 km two-lane bypass",
          },
        ]}
        validate={validate}
        onImport={(list) => void importAll(list)}
        note={
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
            Milestones and WBS are added on each project after the upload.
          </p>
        }
      />
    </div>
  );
}
