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
    label: "Projects and locations",
    items: [
      { label: "Projects", to: "/projects", icon: "hardhat" },
      { label: "Locations", to: "/sites", icon: "mapPin" },
      { label: "Geofences", to: "/geofences", icon: "map" },
      { label: "Resource planning", to: "/people-planning", icon: "users" },
      { label: "Material planning", to: "/material-planning", icon: "calendar" },
    ],
  },
  {
    label: "People and organisation",
    items: [
      { label: "Organogram", to: "/organogram", icon: "network" },
      { label: "Departments", to: "/departments", icon: "building" },
      { label: "Users and roles", to: "/users", icon: "userCog", needs: "access.manage" },
      {
        label: "Approvals",
        to: "/approvals",
        icon: "approvals",
        get badge() {
          return pendingRequests();
        },
      },
      { label: "Job openings", to: "/job-openings", icon: "jobs" },
    ],
  },
  {
    label: "Inventory/Store",
    items: [
      { label: "Stores", to: "/stores", icon: "warehouse" },
      { label: "Materials", to: "/materials", icon: "package" },
      { label: "Vendors", to: "/vendors", icon: "briefcase" },
      { label: "Live stock", to: "/stock", icon: "boxes" },
      { label: "Available materials", to: "/available-materials", icon: "layers" },
    ],
  },
  {
    label: "Equipment",
    items: [
      { label: "Company equipment register", to: "/equipment/register", icon: "truck" },
      { label: "Maintenance", to: "/equipment/maintenance", icon: "wrench" },
      { label: "Available equipment", to: "/equipment/available", icon: "gauge" },
      {
        label: "Project equipment planning",
        to: "/equipment/planning",
        icon: "clipboard",
      },
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
      { label: "Activity log", to: "/audit", icon: "history", needs: "access.manage" },
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

/** Each notification opens the page where the Tenant Admin has to act. */
export const NOTIFICATIONS = [
  {
    id: "n1",
    icon: "approvals",
    title: "REQ-2041 waiting at L2",
    description:
      "Equipment: 2 excavators for NH-65 camp A. Your decision is needed.",
    at: "2026-11-06T10:15:00",
    to: "/approvals/REQ-2041",
  },
  {
    id: "n2",
    icon: "calendar",
    title: "Head Office visit requested — GRV-0118",
    description: "A visit to Head Office has been requested for 10 Nov 2026. Please confirm or reschedule.",
    at: "2026-11-06T08:20:00",
    to: "/grievances/GRV-0118",
  },
  {
    id: "n3",
    icon: "packageX",
    title: "Camp B store out of cement",
    description: "Material request REQ-2039 is marked emergency.",
    at: "2026-11-04T14:40:00",
    to: "/approvals/REQ-2039",
  },
  {
    id: "n4",
    icon: "send",
    title: "QA/QC engineer opening ready to publish",
    description: "Approved for Head Office hiring. Publish it to the metro depot location.",
    at: "2026-10-30T10:00:00",
    to: "/job-openings",
  },
  {
    id: "n5",
    icon: "mapPinOff",
    title: "NH-65 camp B has no geo-fence",
    description: "Attendance cannot be marked there until you draw one.",
    at: "2026-10-28T09:00:00",
    to: "/geofences",
  },
  {
    id: "n6",
    icon: "workflow",
    title: "Recruitment chain not usable",
    description:
      "Set an L1 approver so modules can raise recruitment requests.",
    at: "2026-10-25T09:00:00",
    to: "/approval-matrix/AC-8",
  },
] as const satisfies readonly {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  at: string;
  to: string;
}[];
