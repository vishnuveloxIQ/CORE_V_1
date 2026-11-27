import type { IconName } from "@/shared/ui/icons";
import { useCore } from "@/modules/core-data";

export interface NavItem {
  label: string;
  to: string;
  icon: IconName;
  /** small count bubble */ badge?: number;
  /** privilege the server needs to read this page; the item is hidden from users without it */
  needs?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Badge counts are read from the store when the menu renders: the lists load from the API after sign-in. */
const pendingRequests = () =>
  useCore.getState().requests.filter((r) => r.status === "Pending" || r.status === "In review" || r.status === "Clarification requested").length;
const visitRequests = () => useCore.getState().grievances.filter((g) => g.status === "Requested").length;

/** The first four items also form the phone bottom bar, so the most-used screens come first. */
export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", to: "/dashboard", icon: "dashboard" }],
  },
  {
    label: "Company setup",
    items: [
      { label: "Company profile", to: "/company", icon: "company" },
      { label: "Policies", to: "/policies", icon: "scroll" },
      { label: "Subscription", to: "/subscription", icon: "card" },
    ],
  },
  {
    label: "Projects",
    items: [
      { label: "Projects", to: "/projects", icon: "hardhat" },
      { label: "Geofences", to: "/geofences", icon: "map" },
      {
        label: "Approvals",
        to: "/approvals",
        icon: "fileCheck",
        get badge() {
          return pendingRequests();
        },
      },
      { label: "Sub-contractors", to: "/sub-contractors", icon: "handshake" },
      { label: "Workforce adverts", to: "/workforce-adverts", icon: "target" },
    ],
  },
  {
    label: "Petty cash management",
    items: [
      { label: "Pending approvals", to: "/approvals/petty-cash/pending", icon: "hourglass" },
      { label: "Reports", to: "/approvals/petty-cash/reports", icon: "receipt" },
    ],
  },
  {
    label: "HR management system",
    items: [
      { label: "Resource planning", to: "/people-planning", icon: "users" },
      { label: "Organogram", to: "/organogram", icon: "network" },
      { label: "Departments", to: "/departments", icon: "building" },
      { label: "Users and roles", to: "/users", icon: "userCog", needs: "access.manage" },
      { label: "Job openings", to: "/job-openings", icon: "jobs" },
      { label: "Approved list", to: "/approved-list", icon: "checkc" },
      { label: "Manpower availability", to: "/manpower-availability", icon: "userSearch" },
    ],
  },
  {
    label: "Material Management",
    items: [
      { label: "Store registration", to: "/stores", icon: "warehouse" },
      { label: "Material registration", to: "/materials", icon: "package" },
      { label: "Project material planning", to: "/material-planning", icon: "calendar" },
      { label: "Vendor registration", to: "/vendors", icon: "briefcase" },
      { label: "Live stock", to: "/stock", icon: "boxes" },
      { label: "Available materials", to: "/available-materials", icon: "layers" },
      { label: "Quotation approval", to: "/quotation-approval", icon: "files" },
    ],
  },
  {
    label: "Fleet and Equipment Management",
    items: [
      { label: "Company equipment register", to: "/equipment/register", icon: "truck" },
      { label: "Hired equipment register", to: "/equipment/hired", icon: "receiptRupee" },
      {
        label: "Project equipment planning",
        to: "/equipment/planning",
        icon: "clipboard",
      },
      { label: "Available equipment", to: "/equipment/available", icon: "gauge" },
      { label: "Assigned equipment", to: "/equipment/assigned", icon: "mapPinned" },
      { label: "Maintenance", to: "/equipment/maintenance", icon: "wrench" },
    ],
  },
  {
    label: "Governance",
    items: [
      { label: "Approval matrix", to: "/approval-matrix", icon: "workflow" },
      {
        label: "Grievances",
        to: "/grievances",
        icon: "grievance",
        get badge() {
          return visitRequests();
        },
      },
      { label: "Audit log", to: "/audit", icon: "history", needs: "access.manage" },
    ],
  },
  {
    label: "Support",
    items: [
      { label: "Help and support", to: "/help", icon: "help" },
    ],
  },
];

/** The privilege a path needs, or undefined. Matches the page and anything below it (/users/new, /users/:id). */
export function privilegeFor(pathname: string): string | undefined {
  for (const g of NAV)
    for (const i of g.items)
      if (i.needs && (pathname === i.to || pathname.startsWith(`${i.to}/`))) return i.needs;
  return undefined;
}

/** The menu a user with these privileges sees: items they cannot open are left out, and so are groups left empty. */
export function navFor(privileges: readonly string[]): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.needs || privileges.includes(i.needs)) })).filter(
    (g) => g.items.length > 0,
  );
}
