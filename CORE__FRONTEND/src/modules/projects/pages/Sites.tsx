import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BulkUpload, type RowCheck } from "@/shared/ui/data/BulkUpload";
import { TablePanel } from "@/shared/ui/data/TablePanel";
import { Button } from "@/shared/ui/Button";
import { PageHead } from "@/modules/shell";
import { StatTile } from "@/shared/ui/StatTile";
import { StatusBadge } from "@/shared/ui/Status";
import { useEnter } from "@/shared/hooks/useMotion";
import type { Site } from "@/modules/core-data";
import { bulk, saveEach } from "@/shared/lib/bulk";
import { ACTIVE_TONE } from "@/shared/lib/core";
import { newId, useCore } from "@/modules/core-data";
import { siteSchema } from "../utils/site/schema";
import { Note } from "@/shared/ui/Extras";
import { notify } from "@/shared/lib/toast";
import { Can, MANAGE } from '@/modules/auth';

/** 3.3 Sites master. */
export default function Sites() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "sites");
  const navigate = useNavigate();
  const { sites, stores, projects, projectsSource, sitesLoad, sitesError, loadSites, createSiteRemote } = useCore();
  const [upload, setUpload] = useState(false);
  // every location is created on the server for one project
  const projectOfSite = (s: Site) => (s.projectId ? projects.find((p) => p.id === s.projectId) : undefined);
  /** Saves each row with POST /locations, one after the other, and reports any rows the server refused. */
  const importAll = async (list: Site[]) => {
    if (projectsSource !== "api")
      return notify("Projects were not read from the server, so no location was saved. Reload the page and try again.", 6000);
    // the API body is built from the location fields only, so the row can be passed as it is
    await saveEach(list, (row) => createSiteRemote(row.projectId ?? "", row), (row) => row.code, { one: "location", many: "locations" });
  };
  const open = (id: string) => navigate(`/sites/${id}`);
  const validate = (records: Record<string, string>[]): RowCheck<Site>[] => {
    const dup = bulk.dupes(records.map((r) => r.code));
    return records.map((r) => {
      const codeV = (r.code ?? "").toUpperCase();
      const status = bulk.pick(r.status || "Active", [
        "Active",
        "Inactive",
      ] as const);
      const value = {
        code: codeV,
        name: r.name ?? "",
        addressLine: r.address ?? "",
        city: r.city ?? "",
        state: r.state ?? "",
        pin: r.pin ?? "",
        inCharge: r.in_charge ?? "",
        phone: r.phone ?? "",
        email: r.email ?? "",
        status: status ?? "Active",
      };
      const errors = bulk.check(siteSchema, value);
      const project = projects.find((p) => p.code.toUpperCase() === (r.project_code ?? "").toUpperCase());
      if (!project)
        errors.push(r.project_code ? `Project ID ${r.project_code} is not a known project.` : "project_code is required.");
      if (!status) errors.push("status must be Active or Inactive.");
      if (sites.some((x) => x.code === codeV))
        errors.push(`Location code ${codeV} already exists.`);
      else if (dup.has(codeV))
        errors.push(`Code ${codeV} appears twice in the file.`);
      const label = `${codeV || "?"} · ${r.name || "no name"}`;
      return errors.length
        ? { label, errors }
        : {
            label,
            value: { ...value, id: newId(), projectId: project?.id },
          };
    });
  };

  return (
    <div ref={ref}>
      <PageHead
        crumb="Locations"
        title="Locations"
        desc="View and manage locations, their in-charge and contact details."
        actions={
          <>
            <Can privilege={MANAGE.projects}>
              <Button icon="upload" onClick={() => setUpload(true)}>
                Bulk upload
              </Button>
              <Button
                tone="primary"
                icon="plus"
                onClick={() => navigate("/sites/new")}
              >
                New location
              </Button>
            </Can>
          </>
        }
      />
      {sitesLoad === "error" && (
        <Note title="Locations could not be loaded from the server" icon="alert">
          {sitesError}{" "}
          <Button size="sm" icon="refresh" onClick={() => void loadSites()}>
            Try again
          </Button>
        </Note>
      )}
      <div className="grid stats">
        <StatTile
          label="Total locations"
          value={sites.length}
          icon="mapPin"
          tone="blue"
        />
        <StatTile
          label="Active locations"
          value={sites.filter((s) => s.status === "Active").length}
          icon="checkc"
          tone="green"
        />
        <StatTile
          label="Inactive locations"
          value={sites.filter((s) => s.status === "Inactive").length}
          icon="mapPinOff"
          tone="rose"
        />
        <StatTile
          label="Stores"
          value={stores.length}
          icon="warehouse"
          tone="gold"
        />
      </div>
      <TablePanel
        title="All locations"
        subtitle="Filter by status using the chips; pick more than one to combine. Search by code, name or city. Open a location to edit its details."
        rows={sites}
        rowKey={(s) => s.id}
        columns={[
          {
            header: "Code",
            kind: "c-id",
            cell: (s) => (
              <button
                type="button"
                className="id-link"
                onClick={() => open(s.id)}
              >
                {s.code}
              </button>
            ),
            csv: (s) => s.code,
          },
          {
            header: "Location",
            kind: "c-sub",
            cell: (s) => (
              <>
                <strong>{s.name}</strong>
                <span className="sub">
                  {projectOfSite(s) ? `${projectOfSite(s)!.code} · ` : ""}
                  {s.addressLine}
                </span>
              </>
            ),
            csv: (s) => (projectOfSite(s) ? `${s.name} (${projectOfSite(s)!.code})` : s.name),
          },
          {
            header: "City",
            kind: "c-more",
            cell: (s) => `${s.city}, ${s.state}`,
            csv: (s) => `${s.city}, ${s.state}`,
          },
          {
            header: "In-charge",
            kind: "c-more",
            cell: (s) => (
              <>
                {s.inCharge}
                <span className="sub">{s.phone}</span>
              </>
            ),
            csv: (s) => s.inCharge,
          },
          {
            header: "Status",
            kind: "c-status",
            cell: (s) => (
              <StatusBadge tone={ACTIVE_TONE(s.status)}>{s.status}</StatusBadge>
            ),
            csv: (s) => s.status,
          },
        ]}
        searchText={(s) => `${s.code} ${s.name} ${s.city} ${s.inCharge}`}
        statusOf={(s) => s.status}
        action={(s) => (
          <Button size="sm" onClick={() => open(s.id)}>
            Open
          </Button>
        )}
        searchPlaceholder="Search by code, name or city…"
        exportName="core-sites"
        chipNoun="statuses"
      />
      <BulkUpload
        open={upload}
        onOpenChange={setUpload}
        noun="locations"
        templateName="core-sites-template"
        fields={[
          {
            key: "project_code",
            label: "Project ID",
            required: true,
            example: projects[0]?.code ?? "",
            hint: "The project the location belongs to. It cannot change later.",
          },
          {
            key: "code",
            label: "Location code",
            required: true,
            example: "NH65-C",
            hint: "Capitals, digits and hyphens",
          },
          {
            key: "name",
            label: "Location name",
            required: true,
            example: "NH-65 camp C",
          },
          {
            key: "address",
            label: "Address",
            required: true,
            example: "Camp office, km 34.0",
          },
          { key: "city", label: "City", required: true, example: "Kodad" },
          {
            key: "state",
            label: "State",
            required: true,
            example: "Telangana",
          },
          {
            key: "pin",
            label: "PIN code",
            required: true,
            example: "508206",
            hint: "6 digits",
          },
          {
            key: "in_charge",
            label: "Location in-charge",
            required: true,
            example: "Naveen Reddy",
          },
          {
            key: "phone",
            label: "Store keeper mobile number",
            required: true,
            example: "9811122200",
          },
          {
            key: "email",
            label: "Email",
            required: true,
            example: "site.c@veloxiq.example",
          },
          {
            key: "status",
            label: "Status (optional)",
            example: "Active",
            hint: "Active or Inactive",
          },
        ]}
        validate={validate}
        onImport={(list) => void importAll(list)}
      />
    </div>
  );
}
