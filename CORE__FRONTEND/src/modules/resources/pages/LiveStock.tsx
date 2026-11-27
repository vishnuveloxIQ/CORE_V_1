import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Button } from "@/shared/ui/Button";
import { Note } from "@/shared/ui/Extras";
import { FormGroup, Select } from "@/shared/ui/Field";
import { PageHead } from "@/modules/shell";
import { StatTile } from "@/shared/ui/StatTile";
import { StatusBadge } from "@/shared/ui/Status";
import { useEnter } from "@/shared/hooks/useMotion";
import { byId } from "@/shared/lib/core";
import { STOCK_TONE, useCore } from "@/modules/core-data";

type Level = "Out of Stock" | "Low Stock" | "Available Stock";

/** 3.4 Live stock per store — visibility and extra-material decisions. */
export default function LiveStock() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "stock");
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState("");
  const { stock, stockSource, stores, materials, projects } = useCore();
  const rows = stock
    .filter((s) => !projectId || byId(stores, s.storeId)?.projectId === projectId)
    .map((s) => {
      const m = byId(materials, s.materialId);
      const free = s.qty - s.reserved;
      const level: Level =
        s.qty === 0
          ? "Out of Stock"
          : free < (m?.reorderLevel ?? 0)
            ? "Low Stock"
            : "Available Stock";
      return {
        ...s,
        key: `${s.storeId}:${s.materialId}`,
        m,
        store: byId(stores, s.storeId),
        free,
        level,
      };
    });

  return (
    <div ref={ref}>
      <PageHead
        crumb="Live stock"
        title="Live stock"
        desc="Current stock per store, as published by Stores."
        actions={
          <Button
            tone="primary"
            icon="approvals"
            onClick={() =>
              navigate("/approvals?category=Equipment+and+material")
            }
          >
            Material requests
          </Button>
        }
      />
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <FormGroup label="Show project">
          {(id) => (
            <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}
        </FormGroup>
      </div>
      <div className="grid stats">
        <StatTile
          label="Items tracked"
          value={rows.length}
          icon="boxes"
          tone="blue"
        />
        <StatTile
          label="Available Stock"
          value={rows.filter((r) => r.level === "Available Stock").length}
          icon="checkc"
          tone="green"
        />
        <StatTile
          label="Low Stock"
          value={rows.filter((r) => r.level === "Low Stock").length}
          icon="trendDown"
          tone="gold"
        />
        <StatTile
          label="Out of Stock"
          value={rows.filter((r) => r.level === "Out of Stock").length}
          icon="packageX"
          tone="rose"
        />
      </div>
        {stockSource !== "api" && (
          <Note title="Stock not loaded" icon="alert">
            Live stock could not be read from CORE, so no figures are shown.
          </Note>
        )}
      <TablePanel
        key={projectId}
        title="Stock by store and material"
        subtitle="Filter by stock level using the chips; pick more than one to combine. Search by material or store. Free stock is the quantity on hand less the quantity reserved."
        rows={rows}
        rowKey={(r) => r.key}
        columns={[
          {
            header: "Material",
            kind: "c-id",
            cell: (r) => <strong>{r.m?.code}</strong>,
            csv: (r) => r.m?.code ?? r.materialId,
          },
          {
            header: "Material / store",
            kind: "c-sub",
            cell: (r) => (
              <>
                <strong>{r.m?.name}</strong>
                <span className="sub">{r.store?.name}</span>
              </>
            ),
            csv: (r) => `${r.m?.name} @ ${r.store?.name}`,
          },
          {
            header: "Free",
            kind: "c-amt",
            cell: (r) => `${r.free.toLocaleString("en-IN")} ${r.m?.uom ?? ""}`,
            csv: (r) => String(r.free),
          },
          {
            header: "On hand",
            kind: "c-more",
            cell: (r) => r.qty.toLocaleString("en-IN"),
            csv: (r) => String(r.qty),
          },
          {
            header: "Reserved",
            kind: "c-more",
            cell: (r) => r.reserved.toLocaleString("en-IN"),
            csv: (r) => String(r.reserved),
          },
          {
            header: "Reorder level",
            kind: "c-more",
            cell: (r) => (r.m?.reorderLevel ?? 0).toLocaleString("en-IN"),
            csv: (r) => String(r.m?.reorderLevel ?? 0),
          },
          {
            header: "Level",
            kind: "c-status",
            cell: (r) => (
              <StatusBadge tone={STOCK_TONE[r.level]}>{r.level}</StatusBadge>
            ),
            csv: (r) => r.level,
          },
        ]}
        searchText={(r) => `${r.m?.code} ${r.m?.name} ${r.store?.name}`}
        statusOf={(r) => r.level}
        exportName="core-live-stock"
        chipNoun="stock levels"
      />
    </div>
  );
}
