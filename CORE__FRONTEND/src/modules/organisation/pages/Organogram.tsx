import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { KV, MiniTable, Muted, Tabs } from "@/shared/ui/Extras";
import { CheckRow } from "@/shared/ui/Field";
import { SearchSelect } from "@/shared/ui/SearchSelect";
import { Modal } from "@/shared/ui/Modal";
import { PageHead } from "@/modules/shell";
import { StatusBadge } from "@/shared/ui/Status";
import type { Department, Role } from "@/modules/core-data";
import { useIsPhone } from "@/shared/hooks/useMedia";
import { useEnter } from "@/shared/hooks/useMotion";
import { ACTIVE_TONE, byId } from "@/shared/lib/core";
import { cn } from "@/shared/lib/cn";
import { downloadText, toCsv } from "@/shared/lib/csv";
import { todayISO } from "@/shared/lib/format";
import { requireStepUp } from "@/shared/lib/stepUp";
import { notify } from "@/shared/lib/toast";
import { Can, MANAGE } from '@/modules/auth';
import { Icon } from "@/shared/ui/icons";
import { useCore } from "@/modules/core-data";
import {
  descendants,
  deptColor,
  gradeBand,
  heldText,
  isVacant,
  type RoleValues,
} from "../utils/org";
import { RoleForm } from "../components/RoleForm";

const VIEWS = [
  { value: "chart", label: "Chart" },
  { value: "list", label: "List" },
] as const;
type View = (typeof VIEWS)[number]["value"];
const MIN_Z = 0.4;
const MAX_Z = 1.4;

/** roles at this depth or deeper that have a team, so the chart opens readable */
function foldFrom(roles: Role[], depth: number) {
  const live = roles.filter((r) => r.status === "Active");
  const out = new Set<string>();
  const walk = (pid: string | null, d: number) =>
    live
      .filter((r) => r.reportsToId === pid)
      .forEach((r) => {
        if (d >= depth && live.some((x) => x.reportsToId === r.id))
          out.add(r.id);
        walk(r.id, d + 1);
      });
  walk(null, 0);
  return out;
}

/** Organisation › Organogram: the reporting structure drawn from roles. `?dept=` highlights a department, `?role=` opens a role. */
export default function Organogram() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "organogram");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { roles, departments, loadOrganisation } = useCore();
  useEffect(() => { void loadOrganisation(); }, [loadOrganisation]);
  const phone = useIsPhone();
  // phones start on the list; the chart is one tap away
  const [picked, setView] = useState<View | null>(null);
  const view: View = picked ?? (phone ? "list" : "chart");
  const [showInactive, setShowInactive] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    params.get("role") || params.get("dept") ? new Set() : foldFrom(roles, 2),
  );
  const [open, setOpen] = useState<string | null>(params.get("role"));
  const [form, setForm] = useState<{
    role?: Role;
    preset?: Partial<RoleValues>;
  } | null>(null);
  const deptId = departments.some((d) => d.id === params.get("dept"))
    ? params.get("dept")!
    : "";
  const setDept = (id: string) =>
    setParams(id ? { dept: id } : {}, { replace: true });

  const visible = roles.filter((r) => showInactive || r.status === "Active");
  const ids = new Set(visible.map((r) => r.id));
  const childrenOf = (id: string | null) =>
    visible.filter((r) =>
      id === null
        ? !r.reportsToId || !ids.has(r.reportsToId)
        : r.reportsToId === id,
    );
  const roots = childrenOf(null);
  const q = query.trim().toLowerCase();
  const matches = (r: Role) =>
    (!deptId || r.departmentId === deptId) &&
    (!q ||
      `${r.title} ${r.code} ${r.holder} ${byId(departments, r.departmentId)?.name ?? ""}`
        .toLowerCase()
        .includes(q));
  const filtering = !!deptId || !!q;
  const hits = visible.filter(matches);

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const collapseTo = (depth: number) => {
    const n = new Set<string>();
    const walk = (list: Role[], d: number) =>
      list.forEach((r) => {
        if (d >= depth && childrenOf(r.id).length) n.add(r.id);
        walk(childrenOf(r.id), d + 1);
      });
    walk(roots, 0);
    setCollapsed(n);
  };
  // while searching or highlighting, the branches that lead to a match stay open
  const forcedOpen = new Set<string>();
  if (filtering)
    hits.forEach((h) => {
      let b = byId(roles, h.reportsToId);
      while (b) {
        forcedOpen.add(b.id);
        b = byId(roles, b.reportsToId);
      }
    });
  const shut = new Set([...collapsed].filter((id) => !forcedOpen.has(id)));

  const exportCsv = async () => {
    if (!(await requireStepUp("Export the organisation structure"))) return;
    downloadText(
      `core-organogram-${todayISO()}.csv`,
      toCsv(
        [
          "Role code",
          "Role",
          "Department",
          "Grade",
          "Reports to",
          "Planned positions",
          "Held by",
          "Status",
        ],
        roles.map((r) => [
          r.code,
          r.title,
          byId(departments, r.departmentId)?.name ?? "",
          r.grade,
          byId(roles, r.reportsToId)?.title ?? "Top of organisation",
          String(r.positions),
          r.positions === 1 ? r.holder : "",
          r.status,
        ]),
      ),
    );
    notify(`Organisation exported: ${roles.length} roles`);
  };

  const openRole = byId(roles, open);

  return (
    <div ref={ref}>
      <PageHead
        crumb="Organogram"
        title="Organogram"
        desc="Displays the organisation’s reporting structure based on role hierarchies. Select a role to view, edit, or add a subordinate role."
        actions={
          <>
            <Button icon="download" onClick={() => void exportCsv()}>
              Download
            </Button>
            <Button icon="role" onClick={() => navigate("/users")}>
              Users and roles
            </Button>
            <Can privilege={MANAGE.organisation}>
              <Button tone="primary" icon="plus" onClick={() => setForm({})}>
                Add role
              </Button>
            </Can>
          </>
        }
      />

      <Card
        className="org-card"
        title="Organisation structure"
        subtitle={
          filtering
            ? `${hits.length} role${hits.length === 1 ? "" : "s"} highlighted`
            : `${visible.length} roles in ${new Set(visible.map((r) => r.departmentId)).size} departments`
        }
        action={
          <Tabs
            label="View"
            value={view}
            onChange={setView}
            items={VIEWS as unknown as { value: View; label: string }[]}
          />
        }
      >
        <div className="org-tools">
          <div className="search-wrap">
            <Icon name="search" />
            <input
              className="field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a role or person…"
              aria-label="Find a role or person"
              autoComplete="off"
            />
          </div>
          <SearchSelect
            className="org-dept"
            ariaLabel="Highlight a department"
            placeholder="All departments"
            searchPlaceholder="Search departments…"
            value={deptId}
            onSelect={setDept}
            options={[
              { value: "", label: "All departments" },
              ...departments
                .filter((d) => d.status === "Active")
                .map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
          <CheckRow
            label="Show inactive roles"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          {filtering && (
            <Button
              size="sm"
              icon="close"
              onClick={() => {
                setQuery("");
                setDept("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <Legend
          departments={departments.filter(
            (d) =>
              d.status === "Active" &&
              visible.some((r) => r.departmentId === d.id),
          )}
          active={deptId}
          onPick={(id) => setDept(id === deptId ? "" : id)}
        />

        {roots.length === 0 ? (
          <EmptyState icon="network" title="No roles yet">
            Add the top role first, e.g. Managing director.
          </EmptyState>
        ) : view === "chart" ? (
          <OrgChart
            roots={roots}
            childrenOf={childrenOf}
            collapsed={shut}
            toggle={toggle}
            matches={matches}
            filtering={filtering}
            departments={departments}
            selected={open}
            onOpen={setOpen}
            onExpandAll={() => setCollapsed(new Set())}
            onCollapse={() => collapseTo(2)}
          />
        ) : (
          <OrgList
            roots={roots}
            childrenOf={childrenOf}
            matches={matches}
            filtering={filtering}
            departments={departments}
            onOpen={setOpen}
          />
        )}
      </Card>

      <Modal
        open={!!openRole}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(null);
            if (params.get("role"))
              setParams(deptId ? { dept: deptId } : {}, { replace: true });
          }
        }}
        title={openRole?.title ?? "Role"}
      >
        {openRole && (
          <RoleDetail
            role={openRole}
            onEdit={() => {
              setOpen(null);
              setForm({ role: openRole });
            }}
            onAdd={() => {
              setOpen(null);
              setForm({
                preset: {
                  reportsToId: openRole.id,
                  departmentId: openRole.departmentId,
                },
              });
            }}
            onOpen={setOpen}
          />
        )}
      </Modal>
      <Modal
        open={!!form}
        onOpenChange={(o) => !o && setForm(null)}
        title={
          form?.role
            ? "Edit role"
            : form?.preset?.reportsToId
              ? `Add a role under ${byId(roles, form.preset.reportsToId)?.title ?? ""}`
              : "Add role"
        }
      >
        {form && (
          <RoleForm
            key={form.role?.id ?? form.preset?.reportsToId ?? "new"}
            role={form.role}
            preset={form.preset}
            onDone={(id) => {
              setForm(null);
              if (id) setOpen(id);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function Legend({
  departments,
  active,
  onPick,
}: {
  departments: Department[];
  active: string;
  onPick: (id: string) => void;
}) {
  return (
    <div
      className="org-legend"
      role="group"
      aria-label="Departments (click to highlight)"
    >
      {departments.map((d) => (
        <button
          key={d.id}
          type="button"
          className="org-key"
          aria-pressed={active === d.id}
          style={{ ["--dept" as string]: deptColor(d) }}
          onClick={() => onPick(d.id)}
        >
          <i />
          {d.name}
        </button>
      ))}
    </div>
  );
}

interface TreeProps {
  roots: Role[];
  childrenOf: (id: string | null) => Role[];
  matches: (r: Role) => boolean;
  filtering: boolean;
  departments: Department[];
  onOpen: (id: string) => void;
}

function OrgChart({
  roots,
  childrenOf,
  collapsed,
  toggle,
  matches,
  filtering,
  departments,
  selected,
  onOpen,
  onExpandAll,
  onCollapse,
}: TreeProps & {
  collapsed: Set<string>;
  toggle: (id: string) => void;
  selected: string | null;
  onExpandAll: () => void;
  onCollapse: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const tree = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [size, setSize] = useState({ w: 0, h: 0, vw: 0 });
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(
    null,
  );

  // measure the tree (transforms do not change offset sizes) and the viewport
  useLayoutEffect(() => {
    const t = tree.current;
    const v = viewport.current;
    if (!t || !v) return;
    const measure = () =>
      setSize({ w: t.offsetWidth, h: t.offsetHeight, vw: v.clientWidth });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(t);
    ro.observe(v);
    return () => ro.disconnect();
  }, []);

  const fit = size.w
    ? Math.max(MIN_Z, Math.min(1, (size.vw - 34) / size.w))
    : 1;
  const scale = zoom === "fit" ? fit : zoom;
  const step = (d: number) =>
    setZoom(Math.round(Math.min(MAX_Z, Math.max(MIN_Z, scale + d)) * 10) / 10);

  // drag the background to pan
  const down = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest("button") || !viewport.current)
      return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      l: viewport.current.scrollLeft,
      t: viewport.current.scrollTop,
    };
    viewport.current.setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    const v = viewport.current;
    if (!d || !v) return;
    v.scrollLeft = d.l - (e.clientX - d.x);
    v.scrollTop = d.t - (e.clientY - d.y);
  };
  const up = () => {
    drag.current = null;
  };

  const node = (r: Role, depth: number) => {
    const kids = childrenOf(r.id);
    const shut = collapsed.has(r.id);
    const dept = byId(departments, r.departmentId);
    const hit = matches(r);
    return (
      <li key={r.id}>
        <div className="org-slot">
          <button
            type="button"
            className={cn(
              "org-node",
              filtering && (hit ? "is-hit" : "is-dim"),
              selected === r.id && "is-selected",
              r.status === "Inactive" && "is-inactive",
              depth === 0 && "is-top",
            )}
            style={{ ["--dept" as string]: deptColor(dept) }}
            onClick={() => onOpen(r.id)}
            aria-label={`${r.title}, ${dept?.name ?? ""}, ${heldText(r)}`}
          >
            <span className="org-dept-tag">
              {dept?.code ?? "—"} · {r.grade}
            </span>
            <strong>{r.title}</strong>
            <span className={cn("org-held", isVacant(r) && "is-vacant")}>
              {r.positions > 1 ? (
                <>
                  <Icon name="users" />
                  {r.positions} positions
                </>
              ) : (
                heldText(r)
              )}
            </span>
          </button>
          {kids.length > 0 && (
            <button
              type="button"
              className="org-toggle"
              aria-expanded={!shut}
              aria-label={`${shut ? "Show" : "Hide"} ${kids.length} role${kids.length === 1 ? "" : "s"} under ${r.title}`}
              onClick={() => toggle(r.id)}
            >
              {shut ? (
                `+${descendantCount(r.id, childrenOf)}`
              ) : (
                <Icon name="chevD" />
              )}
            </button>
          )}
        </div>
        {kids.length > 0 && !shut && (
          <ul>{kids.map((k) => node(k, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <>
      <div className="org-zoom">
        <div className="zoom-ctl" role="group" aria-label="Zoom">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => step(-0.1)}
            disabled={scale <= MIN_Z}
          >
            <Icon name="minus" />
          </button>
          <output
            className="org-pct"
            aria-live="polite"
            aria-label="Zoom level"
          >
            {Math.round(scale * 100)}%
          </output>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => step(0.1)}
            disabled={scale >= MAX_Z}
          >
            <Icon name="plus" />
          </button>
        </div>

        <Button
          size="sm"
          icon="unfold"
          onClick={onExpandAll}
          title="Show every team"
        >
          Expand all
        </Button>
        <Button
          size="sm"
          icon="fold"
          onClick={onCollapse}
          title="Fold teams below the second level"
        >
          Collapse
        </Button>
      </div>
      <div
        ref={viewport}
        className="org-viewport"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <div
          className="org-stage"
          style={{
            width: size.w * scale || undefined,
            height: size.h * scale || undefined,
          }}
        >
          <div
            ref={tree}
            className="org-tree"
            style={{ transform: `scale(${scale})` }}
          >
            <ul>{roots.map((r) => node(r, 0))}</ul>
          </div>
        </div>
      </div>
    </>
  );
}

const descendantCount = (
  id: string,
  childrenOf: (id: string | null) => Role[],
): number =>
  childrenOf(id).reduce((n, r) => n + 1 + descendantCount(r.id, childrenOf), 0);

function OrgList({
  roots,
  childrenOf,
  matches,
  filtering,
  departments,
  onOpen,
}: TreeProps) {
  const rows: { r: Role; depth: number }[] = [];
  const walk = (list: Role[], depth: number) =>
    list.forEach((r) => {
      rows.push({ r, depth });
      walk(childrenOf(r.id), depth + 1);
    });
  walk(roots, 0);
  const shown = filtering ? rows.filter((x) => matches(x.r)) : rows;
  if (!shown.length)
    return (
      <EmptyState icon="search" title="No roles match">
        Try another name, or clear the filters.
      </EmptyState>
    );
  return (
    <div className="org-list" role="list">
      {shown.map(({ r, depth }) => {
        const dept = byId(departments, r.departmentId);
        return (
          <button
            key={r.id}
            type="button"
            role="listitem"
            className="org-row"
            style={{
              ["--depth" as string]: filtering ? 0 : depth,
              ["--dept" as string]: deptColor(dept),
            }}
            onClick={() => onOpen(r.id)}
          >
            <i className="dept-dot" />
            <span className="org-row-main">
              <strong>{r.title}</strong>
              <span className="sub">
                {dept?.name ?? "—"} · {r.grade}
                {r.status === "Inactive" ? " · inactive" : ""}
              </span>
            </span>
            <span className={cn("org-row-held", isVacant(r) && "warn-text")}>
              {heldText(r)}
            </span>
            <Icon name="chevR" />
          </button>
        );
      })}
    </div>
  );
}

function RoleDetail({
  role,
  onEdit,
  onAdd,
  onOpen,
}: {
  role: Role;
  onEdit: () => void;
  onAdd: () => void;
  onOpen: (id: string) => void;
}) {
  const { roles, departments } = useCore();
  const dept = byId(departments, role.departmentId);
  const boss = byId(roles, role.reportsToId);
  const direct = roles.filter((r) => r.reportsToId === role.id);
  const team = descendants(roles, role.id);
  const teamPositions = roles
    .filter((r) => team.has(r.id) && r.status === "Active")
    .reduce((n, r) => n + r.positions, 0);
  return (
    <>
      <div
        className="org-detail-head"
        style={{ ["--dept" as string]: deptColor(dept) }}
      >
        <span className="org-dept-tag">{dept?.name ?? "—"}</span>
        <StatusBadge tone={ACTIVE_TONE(role.status)}>{role.status}</StatusBadge>
      </div>
      <div className="detail-grid">
        <KV k="Role code">
          <strong>{role.code}</strong>
        </KV>
        <KV k="Grade">
          <strong>{role.grade}</strong>
          <Muted> · {gradeBand(role.grade)}</Muted>
        </KV>
        <KV k="Held by">
          <strong className={isVacant(role) ? "warn-text" : undefined}>
            {heldText(role)}
          </strong>
        </KV>
        <KV k="Reports to">
          {boss ? (
            <button
              type="button"
              className="id-link"
              onClick={() => onOpen(boss.id)}
            >
              {boss.title}
            </button>
          ) : (
            <strong>Top of organisation</strong>
          )}
        </KV>
        <KV k="Team below">
          <strong>
            {team.size} role{team.size === 1 ? "" : "s"} · {teamPositions}{" "}
            position{teamPositions === 1 ? "" : "s"}
          </strong>
        </KV>
        <KV k="Department head">
          <strong>{dept?.headRoleId === role.id ? "Yes" : "No"}</strong>
        </KV>
        {role.description && (
          <KV k="What the role does" full>
            <span style={{ fontSize: 13.5 }}>{role.description}</span>
          </KV>
        )}
      </div>
      <h3 className="section-t">Direct reports ({direct.length})</h3>
      <MiniTable
        head={["Role", "Held by", ""]}
        empty="No one reports to this role yet."
        rows={direct.map((r) => [
          <strong key="t">{r.title}</strong>,
          <span key="h" className={isVacant(r) ? "warn-text" : undefined}>
            {heldText(r)}
          </span>,
          <Button key="o" size="sm" onClick={() => onOpen(r.id)}>
            Open
          </Button>,
        ])}
      />
      <div className="form-actions">
        <Button
          icon="plus"
          onClick={onAdd}
          disabled={role.status === "Inactive"}
        >
          Add a role under it
        </Button>
        <Can privilege={MANAGE.organisation}>
          <Button tone="primary" icon="pencil" onClick={onEdit}>
            Edit role
          </Button>
        </Can>
      </div>
    </>
  );
}
