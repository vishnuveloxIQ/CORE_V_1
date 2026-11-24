import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
import type { Milestone, Project, Site, WbsNode } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { a11y, num, req } from "@/shared/lib/core";
import { isRemote, PROJECT_TONE } from "@/modules/core-data";
import { fmtDate, money } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { Can, MANAGE } from "@/modules/auth";
import { useCore } from "@/modules/core-data";
import { ProjectForm } from "../components/ProjectForm";
import { GeoFenceTab } from "../components/GeoFenceTab";
import { BoqTab } from "../components/BoqTab";
import { PeopleForm } from "../components/PeopleForm";
import { MaterialForm } from "../components/MaterialForm";
import { PlanForm as EquipmentPlanForm } from "@/modules/resources/pages/EquipmentPlanning";

const TABS = [
  "Details",
  "Milestones",
  "WBS",
  "BOQ",
  "Locations",
  "Geo-fence",
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
  // milestones, WBS, markers, zones and locations live in their own API tables; read them when the page opens
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
            title="Project details"
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
              <KV k="Status">
                <StatusBadge tone={PROJECT_TONE[project.status]}>
                  {project.status}
                </StatusBadge>
              </KV>
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
              <KV k="Description" full>
                <span style={{ fontSize: 13.5 }}>
                  {project.description || "—"}
                </span>
              </KV>
            </div>
          </Card>
        ))}
      {tab === "Milestones" && <Milestones project={project} />}
      {tab === "WBS" && <Wbs project={project} />}
      {tab === "BOQ" && <BoqTab project={project} />}
      {tab === "Locations" && <ProjectLocations project={project} />}
      {tab === "Geo-fence" && (
        <GeoFenceTab
          project={project}
          editing={geoEdit}
          onEdit={() => setGeoEdit(true)}
          onDone={() => setGeoEdit(false)}
        />
      )}
      {tab === "Resource Planning" && <ProjectPeoplePlan project={project} />}
      {tab === "Material Planning" && <ProjectMaterialPlan project={project} />}
      {tab === "Equipment Planning" && <ProjectEquipmentPlan project={project} />}
    </div>
  );
}

// ---------------- Locations ----------------
function ProjectLocations({ project }: { project: Project }) {
  const navigate = useNavigate();
  const sites = useCore((s) => s.sites);
  const assigned = project.locationIds
    .map((id) => sites.find((s) => s.id === id))
    .filter((s): s is Site => !!s);

  return (
    <Card
      title="Assigned locations"
      subtitle="Locations that belong to this project on the server"
      action={
        <Can privilege={MANAGE.projects}>
          <Button
            tone="primary"
            icon="plus"
            onClick={() =>
              navigate(`/sites/new?projectId=${encodeURIComponent(project.id)}`)
            }
          >
            Add location
          </Button>
        </Can>
      }
    >
      <MiniTable
        head={["Code", "Location", "City", "In charge", "Status"]}
        empty="No locations assigned to this project yet."
        rows={assigned.map((s) => [
          s.code,
          <strong key="n">{s.name}</strong>,
          [s.city, s.state].filter(Boolean).join(", ") || "—",
          s.inCharge || "—",
          <StatusBadge
            key="st"
            tone={s.status === "Active" ? "approved" : "draft"}
          >
            {s.status}
          </StatusBadge>,
        ])}
      />
    </Card>
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
          {isSubmitting ? "Saving…" : "Save milestone"}
        </Button>
      </div>
    </form>
  );
}

// ---------------- WBS ----------------
const wbsSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)*$/, "Use numbers separated by dots, e.g. 1.2.3."),
  name: req("Name"),
  parentId: z.string(),
  status: z.enum(["Active", "Inactive"]),
});

function Wbs({ project }: { project: Project }) {
  const removeNode = useCore((s) => s.removeWbsNode);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WbsNode | null>(null);
  const children = (pid: string | null) =>
    project.wbs
      .filter((n) => n.parentId === pid)
      .sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true }),
      );
  const remove = async (n: WbsNode) => {
    if (project.wbs.some((x) => x.parentId === n.id))
      return notify("Remove its child items first.");
    try {
      await removeNode(project.id, n.id);
      notify(`WBS ${n.code} removed`);
    } catch (err) {
      notify(
        err instanceof ApiError && err.code.endsWith("_IN_USE")
          ? `WBS ${n.code} is used by a chainage marker or other record, so it cannot be removed.`
          : `WBS ${n.code} not removed: ${errorText(err)}`,
        6000,
      );
    }
  };
  const render = (pid: string | null, depth: number): ReactNode =>
    children(pid).map((n) => (
      <div key={n.id}>
        <div className="wbs-node" style={{ marginLeft: depth * 22 }}>
          <code>{n.code}</code>
          <span style={{ flex: 1, minWidth: 0 }}>{n.name}</span>
          <StatusBadge tone={n.status === "Inactive" ? "draft" : "approved"}>
            {n.status ?? "Active"}
          </StatusBadge>
          <Can privilege={MANAGE.projects}>
            <Button
              size="sm"
              icon="pencil"
              aria-label={`Edit ${n.code}`}
              onClick={() => setEditing(n)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              tone="danger"
              icon="trash"
              aria-label={`Remove ${n.code}`}
              onClick={() => void remove(n)}
            />
          </Can>
        </div>
        {render(n.id, depth + 1)}
      </div>
    ));
  return (
    <Card
      title="Work breakdown structure"
      subtitle="Hierarchical codes for the project's work items"
      action={
        <Can privilege={MANAGE.projects}>
          <Button size="sm" icon="plus" onClick={() => setAdding(true)}>
            Add WBS item
          </Button>
        </Can>
      }
    >
      {project.wbs.length ? (
        render(null, 0)
      ) : (
        <EmptyState icon="folderTree" title="No WBS yet">
          Add the top-level items first, e.g. 1 Earthwork.
        </EmptyState>
      )}
      <Modal open={adding} onOpenChange={setAdding} title="Add WBS item">
        {adding && (
          <WbsForm project={project} onDone={() => setAdding(false)} />
        )}
      </Modal>
      <Modal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit WBS item"
      >
        {editing && (
          <WbsForm
            project={project}
            node={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </Card>
  );
}

function WbsForm({
  project,
  node,
  onDone,
}: {
  project: Project;
  /** the item being edited; omitted when adding */
  node?: WbsNode;
  onDone: () => void;
}) {
  const addNode = useCore((s) => s.addWbsNode);
  const editNode = useCore((s) => s.editWbsNode);
  const [error, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors: e, isSubmitting },
  } = useForm({
    resolver: zodResolver(wbsSchema),
    defaultValues: {
      code: node?.code ?? "",
      name: node?.name ?? "",
      parentId: node?.parentId ?? "",
      status: node?.status ?? ("Active" as const),
    },
  });
  const submit = handleSubmit(async (v) => {
    setFormError("");
    if (project.wbs.some((n) => n.code === v.code && n.id !== node?.id))
      return setError("code", { message: "This code already exists." });
    if (node && v.parentId === node.id)
      return setFormError("An item cannot be its own parent.");
    const parent = project.wbs.find((n) => n.id === v.parentId);
    if (parent && !v.code.startsWith(`${parent.code}.`))
      return setError("code", { message: `Must start with ${parent.code}.` });
    if (!parent && v.code.includes("."))
      return setError("code", {
        message: "Top-level codes have no dot. Choose a parent.",
      });
    try {
      if (node) {
        await editNode(project.id, node.id, {
          code: v.code,
          name: v.name,
          parentId: v.parentId || null,
          status: v.status,
        });
        notify(`WBS ${v.code} saved`);
      } else {
        await addNode(project.id, {
          code: v.code,
          name: v.name,
          parentId: v.parentId || null,
          status: v.status,
        });
        notify(`WBS ${v.code} added`);
      }
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code.endsWith("_DUPLICATE"))
        return setError("code", { message: "This code already exists." });
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
        <FormGroup label="Parent">
          {(id) => (
            <Select id={id} {...register("parentId")}>
              <option value="">None (top level)</option>
              {project.wbs
                .filter((n) => n.id !== node?.id)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.code} {n.name}
                  </option>
                ))}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Code" required error={e.code?.message}>
          {(id, d) => (
            <Input
              placeholder="Enter WBS code, e.g. 1.2"
              {...a11y(id, d, e.code?.message)}
              {...register("code")}
            />
          )}
        </FormGroup>
        <FormGroup label="Name" required full error={e.name?.message}>
          {(id, d) => (
            <Input {...a11y(id, d, e.name?.message)} {...register("name")} />
          )}
        </FormGroup>
        <FormGroup
          label="Status"
          helper="An inactive item stays in the tree for history but is not used for new work."
        >
          {(id, d) => (
            <Select id={id} aria-describedby={d} {...register("status")}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </Select>
          )}
        </FormGroup>
      </div>
      <div className="form-actions">
        <Button onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" tone="primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : node ? "Save item" : "Add item"}
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
  return (
    <Card
      title="Resource planning"
      subtitle={`Total headcount required: ${total}`}
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
        head={["Role / trade", "Headcount", "Period", "Status"]}
        empty="No manpower planned yet."
        rows={lines.map((l) => [
          <strong key="r">{l.role}</strong>,
          l.headcount,
          `${fmtDate(l.from)} – ${fmtDate(l.to)}`,
          l.status,
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
        head={["Material", "Quantity", "Status"]}
        empty="No materials planned yet."
        rows={lines.map((l) => [
          <strong key="m">
            {materials.find((m) => m.id === l.materialId)?.name ?? l.materialId}
          </strong>,
          `${l.qty.toLocaleString("en-IN")} ${l.uom}`,
          l.status,
        ])}
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
        head={["Equipment type", "Units needed", "Capacity", "Model", "Needed from", "Purpose"]}
        empty="No equipment planned yet."
        rows={lines.map((l) => [
          <strong key="t">{l.equipmentType}</strong>,
          l.plannedQty,
          l.capacity || '—',
          l.model || '—',
          fmtDate(l.from),
          l.reason,
        ])}
      />
    </Card>
  );
}

