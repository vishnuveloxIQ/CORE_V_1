/* eslint-disable react-refresh/only-export-components */
import type { ComponentType, SVGProps } from "react";
import * as Lu from "lucide-react";
import { cn } from "@/shared/lib/cn";

type LuIcon = ComponentType<Lu.LucideProps>;

export const ICON_NAMES = [
  "dashboard",
  "userPlus",
  "users",
  "workflow",
  "sliders",
  "gem",
  "chart",
  "receipt",
  "list",
  "chatq",
  "chatx",
  "help",
  "handshake",
  "receiptRupee",
  "filePlus",
  "files",
  "card",
  "clock",
  "checkc",
  "zap",
  "xc",
  "undo",
  "hourglass",
  "banknote",
  "ban",
  "fileClock",
  "fileCheck",
  "eye",
  "eyeOff",
  "archive",
  "book",
  "rupee",
  "bell",
  "sun",
  "moon",
  "search",
  "menu",
  "close",
  "chevL",
  "chevD",
  "chevR",
  "dots",
  "arrowUp",
  "arrowR",
  "download",
  "plus",
  "shield",
  "sparkle",
  "building",
  "check",
  "inbox",
  "trend",
  "command",
  "sidebar",
  "dotsV",
  "user",
  "swap",
  "house",
  "mapPin",
  "map",
  "warehouse",
  "package",
  "truck",
  "layers",
  "flag",
  "calendar",
  "ruler",
  "key",
  "lock",
  "history",
  "upload",
  "settings",
  "alert",
  "scale",
  "userCog",
  "briefcase",
  "gps",
  "refresh",
  "pencil",
  "trash",
  "info",
  "fingerprint",
  "network",
  "clipboard",
  "hardhat",
  "boxes",
  "scroll",
  "route",
  "userMinus",
  "userCheck",
  "gauge",
  "print",
  // CORE additions, one meaning each
  "approvals",
  "grievance",
  "company",
  "role",
  "jobs",
  "minus",
  "fit",
  "unfold",
  "fold",
  "siren",
  "send",
  "wrench",
  "breakdown",
  "activity",
  "trendDown",
  "packageX",
  "target",
  "copy",
  "userX",
  "calendarClock",
  "mapPinOff",
  "mapPinned",
  "tags",
  "folderTree",
  "userSearch",
  "timer",
  "leave",
  "logout",
  "notFound",
  "grid",
  "leaveCalendar",
] as const;
/** To add an icon: add its name above, then map it to a Lucide icon in ICONS below. */
export type IconName = (typeof ICON_NAMES)[number];

/** Custom two-tone icon: blue calendar showing "10" with a check mark (leave policy). */
const LeaveCalendar: LuIcon = ({
  size,
  color: _c,
  strokeWidth: _s,
  ...rest
}) => {
  void _c;
  void _s;
  const blue = "#2f5fb3";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size ?? 24}
      height={size ?? 24}
      fill="none"
      stroke={blue}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(rest as SVGProps<SVGSVGElement>)}
    >
      <rect x="2.5" y="5" width="16" height="16" rx="2.5" />
      <path d="M2.5 10h16M7 3v4M14 3v4" />
      <text
        x="10.5"
        y="18"
        textAnchor="middle"
        fontSize="7"
        fontWeight="700"
        fontFamily="system-ui,sans-serif"
        fill={blue}
        stroke="none"
      >
        10
      </text>
      <circle cx="18.5" cy="6" r="4.2" fill="#fff" stroke={blue} />
      <path d="m16.5 6 1.5 1.5 2.7-3" />
    </svg>
  );
};

/** Lucide "eye-off" as supplied: a crossed-out eye for hiding a password. Uses currentColor so it follows the field's text colour. */
const EyeOff: LuIcon = ({
  size,
  color: _c,
  strokeWidth,
  ...rest
}) => {
  void _c;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size ?? 24}
      height={size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(rest as SVGProps<SVGSVGElement>)}
    >
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </svg>
  );
};

/** Outline icons (Lucide) */
const ICONS: Record<IconName, LuIcon> = {
  leaveCalendar: LeaveCalendar,
  dashboard: Lu.LayoutDashboard,
  userPlus: Lu.UserPlus,
  users: Lu.Users,
  workflow: Lu.Workflow,
  sliders: Lu.SlidersHorizontal,
  gem: Lu.Gem,
  chart: Lu.BarChart3,
  receipt: Lu.Receipt,
  list: Lu.ListChecks,
  chatq: Lu.MessageCircleQuestion,
  chatx: Lu.MessageCircleWarning,
  help: Lu.LifeBuoy,
  handshake: Lu.Handshake,
  receiptRupee: Lu.ReceiptIndianRupee,
  filePlus: Lu.FilePlus2,
  files: Lu.Files,
  card: Lu.CreditCard,
  clock: Lu.Clock,
  checkc: Lu.CheckCircle2,
  zap: Lu.Zap,
  xc: Lu.XCircle,
  undo: Lu.Undo2,
  hourglass: Lu.Hourglass,
  banknote: Lu.Banknote,
  ban: Lu.Ban,
  fileClock: Lu.FileClock,
  fileCheck: Lu.FileCheck2,
  eye: Lu.Eye,
  eyeOff: EyeOff,
  archive: Lu.Archive,
  book: Lu.BookOpen,
  rupee: Lu.IndianRupee,
  bell: Lu.Bell,
  sun: Lu.Sun,
  moon: Lu.Moon,
  search: Lu.Search,
  menu: Lu.Menu,
  close: Lu.X,
  chevL: Lu.ChevronLeft,
  chevD: Lu.ChevronDown,
  chevR: Lu.ChevronRight,
  dots: Lu.MoreHorizontal,
  arrowUp: Lu.ArrowUpRight,
  arrowR: Lu.ArrowRight,
  download: Lu.Download,
  plus: Lu.Plus,
  shield: Lu.ShieldCheck,
  sparkle: Lu.Sparkles,
  building: Lu.Building2,
  check: Lu.Check,
  inbox: Lu.Inbox,
  trend: Lu.TrendingUp,
  command: Lu.Command,
  sidebar: Lu.PanelLeft,
  dotsV: Lu.MoreVertical,
  user: Lu.UserCircle,
  swap: Lu.ArrowLeftRight,
  house: Lu.HouseHeart,
  mapPin: Lu.MapPin,
  map: Lu.Map,
  warehouse: Lu.Warehouse,
  package: Lu.Package,
  truck: Lu.Truck,
  layers: Lu.Layers,
  flag: Lu.Flag,
  calendar: Lu.CalendarDays,
  ruler: Lu.Ruler,
  key: Lu.KeyRound,
  lock: Lu.Lock,
  history: Lu.History,
  upload: Lu.Upload,
  settings: Lu.Settings,
  alert: Lu.TriangleAlert,
  scale: Lu.Scale,
  userCog: Lu.UserCog,
  briefcase: Lu.Briefcase,
  gps: Lu.Navigation,
  refresh: Lu.RefreshCw,
  pencil: Lu.Pencil,
  trash: Lu.Trash2,
  info: Lu.Info,
  fingerprint: Lu.Fingerprint,
  network: Lu.Network,
  clipboard: Lu.ClipboardList,
  hardhat: Lu.HardHat,
  boxes: Lu.Boxes,
  print: Lu.Printer,
  scroll: Lu.ScrollText,
  route: Lu.Route,
  userMinus: Lu.UserMinus,
  userCheck: Lu.UserCheck,
  gauge: Lu.Gauge,
  approvals: Lu.ClipboardCheck,
  grievance: Lu.MessageSquareWarning,
  company: Lu.Landmark,
  role: Lu.IdCard,
  jobs: Lu.BriefcaseBusiness,
  minus: Lu.Minus,
  fit: Lu.Scan,
  unfold: Lu.ChevronsUpDown,
  fold: Lu.ChevronsDownUp,
  siren: Lu.Siren,
  send: Lu.Send,
  wrench: Lu.Wrench,
  breakdown: Lu.OctagonAlert,
  activity: Lu.Activity,
  trendDown: Lu.TrendingDown,
  packageX: Lu.PackageX,
  target: Lu.LocateFixed,
  copy: Lu.Copy,
  userX: Lu.UserX,
  calendarClock: Lu.CalendarClock,
  mapPinOff: Lu.MapPinOff,
  mapPinned: Lu.MapPinned,
  tags: Lu.Tags,
  folderTree: Lu.FolderTree,
  userSearch: Lu.UserSearch,
  timer: Lu.Timer,
  leave: Lu.TreePalm,
  logout: Lu.LogOut,
  notFound: Lu.SearchX,
  grid: Lu.LayoutGrid,
};

export interface IconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "name" | "ref"
> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size, className, ...rest }: IconProps) {
  const C = ICONS[name] ?? Lu.MoreHorizontal;
  const px = size ? { width: size, height: size } : undefined;
  return (
    <C
      aria-hidden
      className={cn("i o", className)}
      style={px}
      strokeWidth={1.9}
      {...(rest as Lu.LucideProps)}
    />
  );
}
