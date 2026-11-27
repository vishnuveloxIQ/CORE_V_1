import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { KV, MiniTable, Note, Tabs } from "@/shared/ui/Extras";
import { ApiError, errorText } from "@/shared/lib/api";
import { FormGroup, Input, Select } from "@/shared/ui/Field";
import { Modal } from "@/shared/ui/Modal";
import { ActionScope, PageHead } from "@/modules/shell";
import { StatusBadge } from "@/shared/ui/Status";
import type { Milestone, Project } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { a11y, num, req } from "@/shared/lib/core";
import { EXECUTION_MODE_LABEL, isRemote, PROJECT_TONE, PROJECT_TYPE_LABEL } from "@/modules/core-data";
import { fmtDate, money } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { Can, MANAGE } from "@/modules/auth";
import { useCore } from "@/modules/core-data";
import { ProjectForm } from "../components/ProjectForm";
import { GeoFenceTab } from "../components/GeoFenceTab";
import { BoqTab } from "../components/BoqTab";
import { SubContractorTab } from "../components/SubContractorTab";
import { PeopleForm } from "../components/PeopleForm";
import { MaterialForm } from "../components/MaterialForm";
import { PlanForm as EquipmentPlanForm } from "@/modules/resources";
import { ChainageEdit, ChainageView } from "../components/ChainageTab";
import { useApprovedPeople } from "@/modules/organisation";

const TABS = [
  "Details",
  "Milestones",
  "BOQ",
  "Chainage",
  "Geo-fence",
  "Sub-contractor registration",
  "Resource Planning",
  "Material Planning",
  "Equipment Planning",
] as const;
type Tab = (typeof TABS)[number];

export default function ProjectDetail() {
  const ref = useRef<HTMLDivElement>(null);
  const { id = "" } = useParams();
  useEnter(ref, `project-${id}`);
  const navigate = useNavigate();
  const project = useCore((s) => s.projects.find((p) => p.id === id));
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() =>
    (TABS as readonly string[]).includes(params.get("tab") ?? "")
      ? (params.get("tab") as Tab)
      : "Details",
  );
  const [editing, setEditing] = useState(false);
  const [geoEdit, setGeoEdit] = useState(params.get("edit") === "1");
  const remote = isRemote(project);
  const loadParts = useCore((s) => s.loadProjectParts);
  const partsLoad = useCore((s) => s.partsLoad[id]);
  const partsError = useCore((s) => s.partsError[id]);
  // milestones, markers, zones and locations live in their own API tables; read them when the page opens
  useEffect(() => {
    if (remote) void loadParts(id);
  }, [id, remote, loadParts]);
  const back = (
    <Button icon="chevL" onClick={() => navigate("/projects")}>
      Back to projects
    </Button>
  );
  if (!project) {
    return (
      <div ref={ref}>
        <PageHead
          crumb="Projects"
          title="Project not found"
          desc={`No project with ID ${id}.`}
          actions={back}
        />
        <Card>
          <EmptyState icon="hardhat" title="Nothing to show">
            Go back to the projects list.
          </EmptyState>
        </Card>
      </div>
    );
  }
  return (
    <div ref={ref}>
      <PageHead
        crumb={project.code}
        title={project.name}
        desc={`Project ${project.code} for ${project.client}.`}
        actions={back}
      />
      <div style={{ marginBottom: 14 }} data-enter>
        <Tabs
          label="Project sections"
          value={tab}
          onChange={setTab}
          items={TABS}
        />
      </div>
      {partsLoad === "error" && tab !== "Details" && (
        <Note
          title="This project's details could not be loaded from the server"
          icon="alert"
        >
          {partsError}{" "}
          <Button size="sm" icon="refresh" onClick={() => void loadParts(id)}>
            Try again
          </Button>
        </Note>
      )}
      {tab === "Details" &&
        (editing ? (
          <Card className="max-w-[920px]" title="Edit project">
            <ProjectForm
              project={project}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                notify("Project saved");
              }}
            />
          </Card>
        ) : (
          <Card
            title={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                Project details
                <StatusBadge tone={PROJECT_TONE[project.status]}>{project.status}</StatusBadge>
              </span>
            }
            action={
              <Can privilege={MANAGE.projects}>
                <Button
                  size="sm"
                  icon="pencil"
                  onClick={() => setEditing(true)}
                >
                  Edit
                </Button>
              </Can>
            }
          >
            <div className="detail-grid">
              <KV k="Client">
                <strong>{project.client}</strong>
              </KV>
              <KV k="Contract value">
                <strong className="amount">{money(project.value)}</strong>
              </KV>
              <KV k="Start">
                <strong>{fmtDate(project.startDate)}</strong>
              </KV>
              <KV k="End">
                <strong>{fmtDate(project.endDate)}</strong>
              </KV>
              <KV k="Consultant">
                <strong>{project.consultantName || "—"}</strong>
              </KV>
              <KV k="State">
                <strong>{project.state || "—"}</strong>
              </KV>
              <KV k="Execution mode" full>
                <strong>{project.executionMode ? EXECUTION_MODE_LABEL[project.executionMode] : "—"}</strong>
              </KV>
              <KV k="Department" full>
                <strong>{project.department || "—"}</strong>
              </KV>
              <KV k="Project type" full>
                <strong>{project.projectType ? PROJECT_TYPE_LABEL[project.projectType] : "—"}</strong>
              </KV>
              <KV k="Description" full>
                <span style={{ fontSize: 13.5 }}>
                  {project.description || "â€”"}
                </span>
              </KV>
            </div>
          </Card>
        ))}
      {tab === "Milestones" && <Milestones project={project} />}
      {tab === "BOQ" && <BoqTab project={project} />}
      {tab === "Chainage" && <ProjectChainage project={project} />}
      {tab === "Geo-fence" && (
        <GeoFenceTab
          project={project}
          editing={geoEdit}
          onEdit={() => setGeoEdit(true)}
          onDone={() => setGeoEdit(false)}
        />
      )}
      {tab === "Sub-contractor registration" && <SubContractorTab project={project} />}
      {tab === "Resource Planning" && <ProjectPeoplePlan project={project} />}
      {tab === "Material Planning" && <ProjectMaterialPlan project={project} />}
      {tab === "Equipment Planning" && <ProjectEquipmentPlan project={project} />}
    </div>
  );
}

// ---------------- Chainage ----------------
/** The chainage range and markers are attached to the project itself, and are edited here. */
function ProjectChainage({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <ChainageEdit project={project} onDone={() => setEditing(false)} />
  ) : (
    <ChainageView
      project={project}
      action={
        <Can privilege={MANAGE.projects}>
          <Button size="sm" icon="pencil" onClick={() => setEditing(true)}>
            Edit chainage
          </Button>
        </Can>
      }
    />
  );
}

// ---------------- Milestones ----------------
const msSchema = z.object({
  name: req("Milestone"),
  due: z.string().min(1, "Pick a due date."),
  weight: num("Weight", 1).max(100, "At most 100%."),
  status: z.enum(["Not started", "In progress", "Done", "Cancelled"]),
});
const MS_TONE = {
  "Not started": "draft",
  "In progress": "review",
  Done: "approved",
  Cancelled: "rejected",
} as const;
/** The server stores pending, achieved or cancelled, so In progress is offered for sample data only. */
const msStatuses = (remote: boolean) =>
  remote
    ? (["Not started", "Done", "Cancelled"] as const)
    : (["Not started", "In progress", "Done"] as const);

function Milestones({ project }: { project: Project }) {
  const removeMilestone = useCore((s) => s.removeMilestone);
  const [edit, setEdit] = useState<Milestone | "new" | null>(null);
  const [busy, setBusy] = useState("");
  const remove = async (m: Milestone) => {
    setBusy(m.id);
    try {
      await removeMilestone(project.id, m.id);
      notify("Milestone removed");
    } catch (err) {
      notify(`Milestone not removed: ${errorText(err)}`, 6000);
    } finally {
      setBusy("");
    }
  };
  const total = project.milestones.reduce((s, m) => s + m.weight, 0);
  const done = project.milestones
    .filter((m) => m.status === "Done")
    .reduce((s, m) => s + m.weight, 0);
  const sorted = [...project.milestones].sort((a, b) =>
    a.due.localeCompare(b.due),
  );
  return (
    <Card
      title="Milestones"
      subtitle={`Milestone weights total ${total}%, and ${done}% of the work is complete.`}
      action={
        <Can privilege={MANAGE.projects}>
          <Button size="sm" icon="plus" onClick={() => setEdit("new")}>
            Add milestone
          </Button>
        </Can>
      }
    >
      <div className="meter" aria-label={`${done}% complete`}>
        <i style={{ width: `${Math.min(done, 100)}%` }} />
      </div>
      <div style={{ marginTop: 16 }}>
        <MiniTable
          head={["Milestone", "Due", "Weight", "Status", ""]}
          empty="No milestones yet."
          rows={sorted.map((m) => [
            <strong key="n">{m.name}</strong>,
            fmtDate(m.due),
            `${m.weight}%`,
            <StatusBadge key="s" tone={MS_TONE[m.status]}>
              {m.status}
            </StatusBadge>,
            <Can key="a" privilege={MANAGE.projects}>
              <div className="row-actions">
                <Button
                  size="sm"
                  icon="pencil"
                  onClick={() => setEdit(m)}
                  aria-label={`Edit ${m.name}`}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  tone="danger"
                  icon="trash"
                  aria-label={`Remove ${m.name}`}
                  disabled={busy === m.id}
                  onClick={() => void remove(m)}
                >
                  Remove
                </Button>
              </div>
            </Can>,
          ])}
        />
      </div>
      <Modal
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit === "new" ? "Add milestone" : "Edit milestone"}
      >
        {edit && (
          <MilestoneForm
            key={edit === "new" ? "new" : edit.id}
            project={project}
            milestone={edit === "new" ? undefined : edit}
            onDone={() => setEdit(null)}
          />
        )}
      </Modal>
    </Card>
  );
}

function MilestoneForm({
  project,
  milestone,
  onDone,
}: {
  project: Project;
  milestone?: Milestone;
  onDone: () => void;
}) {
  const saveMilestone = useCore((s) => s.saveMilestone);
  const statuses = msStatuses(isRemote(project));
  const [error, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors: e, isSubmitting },
  } = useForm({
    resolver: zodResolver(msSchema),
    defaultValues: milestone
      ? {
          name: milestone.name,
          due: milestone.due,
          weight: milestone.weight,
          status: milestone.status,
        }
      : { name: "", due: "", weight: 10, status: "Not started" as const },
  });
  const submit = handleSubmit(async (v) => {
    setFormError("");
    const others = project.milestones
      .filter((m) => m.id !== milestone?.id)
      .reduce((s, m) => s + m.weight, 0);
    if (others + v.weight > 100)
      return setError("weight", {
        message: `Total would be ${others + v.weight}%. At most ${100 - others}% is left.`,
      });
    try {
      await saveMilestone(project.id, v, milestone?.id);
      notify(milestone ? "Milestone saved" : "Milestone added");
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        await useCore.getState().loadProjectParts(project.id);
        return setFormError(
          "Someone else changed this milestone. The latest version is loaded; close this and try again.",
        );
      }
      setFormError(errorText(err));
    }
  });
  return (
    <form noValidate onSubmit={submit}>
      {error && (
        <div className="login-error" role="alert" style={{ marginBottom: 14 }}>
          <span>{error}</span>
        </div>
      )}
      <ActionScope project={{ name: project.name, code: project.code }} />
      <div className="form-grid">
        <FormGroup label="Milestone" required full error={e.name?.message}>
          {(id, d) => (
            <Input {...a11y(id, d, e.name?.message)} {...register("name")} />
          )}
        </FormGroup>
        <FormGroup label="Due date" required error={e.due?.message}>
          {(id, d) => (
            <Input
              type="date"
              min={project.startDate}
              max={project.endDate}
              {...a11y(id, d, e.due?.message)}
              {...register("due")}
            />
          )}
        </FormGroup>
        <FormGroup label="Weight (%)" required error={e.weight?.message}>
          {(id, d) => (
            <Input
              type="number"
              {...a11y(id, d, e.weight?.message)}
              {...register("weight", { valueAsNumber: true })}
            />
          )}
        </FormGroup>
        <FormGroup label="Status">
          {(id) => (
            <Select id={id} {...register("status")}>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          )}
        </FormGroup>
      </div>
      <div className="form-actions">
        <Button onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" tone="primary" disabled={isSubmitting}>
          {isSubmitting ? "Savingâ€¦" : "Save milestone"}
        </Button>
      </div>
    </form>
  );
}

/** TODO(backend): GET /projects/{id}/people-plan (mock data today). */
function ProjectPeoplePlan({ project }: { project: Project }) {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const lines = useCore((s) => s.peoplePlan).filter(
    (l) => l.projectId === project.id,
  );
  const total = lines.reduce((n, l) => n + l.headcount, 0);
  const allApproved = useApprovedPeople((s) => s.people);
  const approved = allApproved.filter((p) => p.projectCode === project.code);
  return (
    <Card
      title="Resource planning"
      subtitle={`Planned : ${total}`}
      action={
        <div className="row-actions">
          <Can privilege={MANAGE.masters}>
            <Button
              size="sm"
              tone="primary"
              icon="plus"
              onClick={() => setAdding(true)}
            >
              Add requirement
            </Button>
          </Can>
          <Button size="sm" onClick={() => navigate("/people-planning")}>
            Manage
          </Button>
        </div>
      }
    >
      <Modal open={adding} onOpenChange={setAdding} title="Add requirement">
        {adding && (
          <PeopleForm
            defaultProject={project.id}
            lockProject
            onDone={() => setAdding(false)}
          />
        )}
      </Modal>
      <MiniTable
        head={["Department", "Role", "Headcount", "Onboarded"]}
        empty="No manpower planned yet."
        rows={lines.map((l) => [
          l.department || "—",
          <strong key="r">{l.role}</strong>,
          l.headcount,
          // onboarded people on this project with the requirement's department and role (designation)
          approved.filter(
            (p) =>
              p.status === "Onboarded" &&
              p.department === l.department &&
              p.designation.trim().toLowerCase() === l.role.trim().toLowerCase(),
          ).length,
        ])}
      />
      <h3 style={{ margin: "20px 0 8px", fontSize: 15 }}>Approved and onboarded people</h3>
      <MiniTable
        head={["Sl no", "Employee", "Designation", "Department", "Joining date", "Status"]}
        empty="No approved people for this project yet. Add them under People and organisation, Approved list."
        rows={approved.map((p, i) => [
          i + 1,
          <strong key="n">{p.name}</strong>,
          p.designation,
          p.department,
          fmtDate(p.joiningDate),
          p.status,
        ])}
      />
    </Card>
  );
}

/** TODO(backend): GET /projects/{id}/material-plan (mock data today). */
function ProjectMaterialPlan({ project }: { project: Project }) {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const lines = useCore((s) => s.materialPlan).filter(
    (l) => l.projectId === project.id,
  );
  const materials = useCore((s) => s.materials);
  return (
    <Card
      title="Material planning"
      subtitle={`${lines.length} material lines planned`}
      action={
        <div className="row-actions">
          <Can privilege={MANAGE.masters}>
            <Button
              size="sm"
              tone="primary"
              icon="plus"
              onClick={() => setAdding(true)}
            >
              Add material line
            </Button>
          </Can>
          <Button size="sm" onClick={() => navigate("/material-planning")}>
            Manage
          </Button>
        </div>
      }
    >
      <Modal open={adding} onOpenChange={setAdding} title="Add material line">
        {adding && (
          <MaterialForm
            defaultProject={project.id}
            lockProject
            onDone={() => setAdding(false)}
          />
        )}
      </Modal>
      <MiniTable
        head={["Material", "HSN code", "UOM", "Quantity"]}
        empty="No materials planned yet."
        rows={lines.map((l) => {
          const material = materials.find((m) => m.id === l.materialId);
          return [
            <strong key="m">{material?.name ?? l.materialId}</strong>,
            material?.hsn || "—",
            l.uom,
            l.qty.toLocaleString("en-IN"),
          ];
        })}
      />
    </Card>
  );
}

/** Equipment plan lines of this project, with the same add popup as the Equipment planning page. */
function ProjectEquipmentPlan({ project }: { project: Project }) {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const lines = useCore((s) => s.planLines).filter((l) => l.projectId === project.id);
  return (
    <Card
      title="Equipment planning"
      subtitle={`${lines.length} equipment plan lines`}
      action={
        <div className="row-actions">
          <Can privilege={MANAGE.masters}>
            <Button size="sm" tone="primary" icon="plus" onClick={() => setAdding(true)}>
              Add equipment line
            </Button>
          </Can>
          <Button size="sm" onClick={() => navigate("/equipment/planning")}>
            Manage
          </Button>
        </div>
      }
    >
      <Modal open={adding} onOpenChange={setAdding} title="Add equipment line">
        {adding && <EquipmentPlanForm defaultProjectId={project.id} lockProject onDone={() => setAdding(false)} />}
      </Modal>
      <MiniTable
        head={["Equipment type", "Required units", "Capacity", "Model", "Required from"]}
        empty="No equipment planned yet."
        rows={lines.map((l) => [
          <strong key="t">{l.equipmentType}</strong>,
          l.plannedQty,
          l.capacity || 'â€”',
          l.model || 'â€”',
          fmtDate(l.from),
        ])}
      />
    </Card>
  );
}

