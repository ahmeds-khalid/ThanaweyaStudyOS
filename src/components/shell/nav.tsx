import { BookMarked, CalendarDays, CalendarRange, GraduationCap, LayoutDashboard, RefreshCcw, Settings, Sun, TriangleAlert, Timer, type LucideIcon } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";

export interface NavItem {
  href: string;
  key: TranslationKey;
  icon: LucideIcon;
}

/** The whole desktop sidebar. Settings is pinned to the bottom. */
export const NAV: NavItem[] = [
  { href: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/today", key: "nav.today", icon: Sun },
  { href: "/calendar", key: "nav.calendar", icon: CalendarDays },
  { href: "/subjects", key: "nav.subjects", icon: BookMarked },
  { href: "/revision", key: "nav.revision", icon: RefreshCcw },
];

export const SETTINGS_NAV: NavItem = { href: "/settings", key: "nav.settings", icon: Settings };

/** Mobile bottom bar (the last slot, "More", opens the drawer). */
export const MOBILE_PRIMARY: NavItem[] = [
  { href: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/today", key: "nav.today", icon: Sun },
  { href: "/calendar", key: "nav.calendar", icon: CalendarDays },
  { href: "/study", key: "nav.study", icon: Timer },
];

/** Reachable from the mobile "More" drawer (and from links inside pages on desktop). */
export const MORE_NAV: NavItem[] = [
  { href: "/revision", key: "nav.revision", icon: RefreshCcw },
  { href: "/subjects", key: "nav.subjects", icon: BookMarked },
  { href: "/schedule", key: "nav.schedule", icon: CalendarRange },
  { href: "/mistakes", key: "nav.mistakes", icon: TriangleAlert },
  { href: "/exams", key: "nav.exams", icon: GraduationCap },
  SETTINGS_NAV,
];
