import { useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BarsCard,
  type BarRow,
  type BarSeries,
} from "@/shared/ui/charts/BarsCard";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Button } from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/EmptyState";
import { SearchSelect } from "@/shared/ui/SearchSelect";
import { PageHead } from "@/modules/shell";
import { StatTile } from "@/shared/ui/StatTile";
import { useEnter } from "@/shared/hooks/useMotion";
import { projectOf, useCore } from "@/modules/core-data";
import { requestColumns } from "@/modules/approvals";

type Level = "In stock" | "Low stock" | "Out of stock";

const STOCK_SERIES: BarSeries[] = [
  { key: "available", name: "Available stock", color: "var(--c-blue)" },
  { key: "low", name: "Low stock", color: "var(--c-amber)" },
  { key: "out", name: "Out of stock", color: "var(--c-red)" },
];
const PROJECT_SERIES: BarSeries[] = [
  { key: "stores", name: "Stores", color: "var(--chart-2)" },
  { key: "requests", name: "Open requests", color: "var(--c-amber)" },
  ...STOCK_SERIES,
];

/** CORE home. The project filter (top right of the chart) drives the chart and the approvals table. */
export default function Dashboard() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "dashboard");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // stock comes from GET /stock-levels (no rows when that read fails)
  const {
    requests,
    projects,
    stores,
    stock,
    materials,
    grievances,
  } = useCore();
  const openGrievances = grievances.filter((g) =>
    ["Requested", "Confirmed", "Rescheduled"].includes(g.status),
  ).length;

  const project = projects.find((p) => p.id === params.get("project")) ?? null;
  const setProject = (id: string) =>
    setParams(id ? { project: id } : {}, { replace: true });

  const isOpenReq = (s: string) => s === "Pending" || s === "In review";
  const waiting = requests.filter((r) => isOpenReq(r.status));

  // ---------- stock level per row ----------
  const levelOf = (
    qty: number,
    reserved: number,
    materialId: string,
  ): Level => {
    if (qty === 0) return "Out of stock";
    return qty - reserved <
      (materials.find((m) => m.id === materialId)?.reorderLevel ?? 0)
      ? "Low stock"
      : "In stock";
  };
  // A store, unit or request belongs to the project that owns its chainage marker.
  const projectIdOf = (chainageId: string) =>
    projectOf(projects, chainageId)?.id ?? "";
  const inProject = (chainageId: string, projectId: string) =>
    projectIdOf(chainageId) === projectId;

  /** Counts for every store, unit and request whose chainage passes `at`. */
  const countsWhere = (at: (chainageId: string) => boolean) => {
    const levels: Level[] = stock.flatMap((r) => {
      const store = stores.find((s) => s.id === r.storeId);
      return store && at(store.chainageId)
        ? [levelOf(r.qty, r.reserved, r.materialId)]
        : [];
    });
    return {
      stores: stores.filter((s) => at(s.chainageId)).length,
      requests: waiting.filter((r) => at(r.chainageId)).length,
      available: levels.filter((l) => l === "In stock").length,
      low: levels.filter((l) => l === "Low stock").length,
      out: levels.filter((l) => l === "Out of stock").length,
    };
  };

  // ---------- chart: projects, or the chainage markers of the selected project ----------
  const projectRows: BarRow[] = projects.map((p) => ({
    label: p.code,
    full: p.name,
    ...countsWhere((c) => inProject(c, p.id)),
  }));
  const markers = project?.chainage?.markers ?? [];
  // Plan lines are project-level, so the chainage chart has no planned series.
  const markerRows: BarRow[] = markers.map((m) => ({
    label: m.label,
    full: `CH ${m.km} km · ${m.label}`,
    ...countsWhere((c) => c === m.id),
  }));

  // ---------- stock tile and project scope for the approvals table ----------
  const lowStock = stock.filter(
    (r) => levelOf(r.qty, r.reserved, r.materialId) !== "In stock",
  ).length;

  const filter = (
    <SearchSelect
      className="card-filter"
      ariaLabel="Filter by project"
      placeholder="All projects"
      searchPlaceholder="Search projects…"
      value={project?.id ?? ""}
      onSelect={setProject}
      options={[
        { value: "", label: "All projects" },
        ...projects.map((p) => ({
          value: p.id,
          label: `${p.code} · ${p.name}`,
        })),
      ]}
    />
  );

  return (
    <div ref={ref}>
      <PageHead
        crumb="Dashboard"
        title="Dashboard"
        desc="Master data, approvals and grievances that require administrator attention."
        actions={<Button tone="primary" icon="approvals" onClick={() => navigate("/approvals")}>Open approvals</Button>}
      />

      <div className="grid stats">
        <StatTile
          label="Waiting for approval"
          value={waiting.length}
          icon="approvals"
          tone="gold"
          to="/approvals"
          actionLabel="Open approvals"
        />
        <StatTile
          label="Low stock"
          value={lowStock}
          icon="trendDown"
          tone="green"
          to="/stock"
          actionLabel="Open live stock"
        />
        <StatTile
          label="Active projects"
          value={projects.filter((p) => p.status === "Active").length}
          icon="hardhat"
          tone="blue"
          to="/projects"
          actionLabel="Open projects"
        />
        <StatTile
          label="Grievances"
          value={openGrievances}
          icon="grievance"
          tone="rose"
          to="/grievances"
          actionLabel="Open grievances"
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        {project ? (
          <BarsCard
            key={`markers-${project.id}`}
            title={`${project.code} chainages`}
            subtitle={`${project.name} · ${markers.length} marker${markers.length === 1 ? "" : "s"}`}
            data={markerRows}
            series={PROJECT_SERIES}
            action={filter}
            empty={
              <EmptyState icon="mapPin" title="No chainage markers yet">
                Add chainage markers to this project to see its details here.
              </EmptyState>
            }
          />
        ) : (
          <BarsCard
            key="projects"
            title="Total projects"
            data={projectRows}
            series={PROJECT_SERIES}
            action={filter}
          />
        )}
      </div>

      <TablePanel
        title="Awaiting approvals "
        subtitle={
          project
            ? `Filter by request type using the chips; pick more than one to combine. Requests on ${project.code} chainages, emergency first.`
            : "Filter by request type using the chips; pick more than one to combine. Emergency first. Open a request to decide."
        }
        columns={requestColumns((r) => navigate(`/approvals/${r.id}`), projects)}
        key={project?.id ?? "all"}
        rows={[...waiting]
          .filter((r) => !project || inProject(r.chainageId, project.id))
          .sort(
            (a, b) =>
              Number(b.emergency) - Number(a.emergency) ||
              a.raisedAt.localeCompare(b.raisedAt),
          )}
        rowKey={(r) => r.id}
        searchText={(r) => `${r.id} ${r.type} ${r.title} ${r.raisedBy}`}
        statusOf={(r) => r.type}
        action={(r) => (
          <Button size="sm" onClick={() => navigate(`/approvals/${r.id}`)}>
            Review
          </Button>
        )}
        exportName="core-waiting-approvals"
      />
    </div>
  );
}
