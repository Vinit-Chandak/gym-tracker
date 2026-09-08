import type { Route } from "next";
import { CalendarDays, Dumbbell, type LucideIcon, MapPin, Settings, TrendingUp } from "lucide-react";

export type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
};

/** Bottom navigation tabs, in display order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: Dumbbell },
  { href: "/history", label: "History", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/gyms", label: "Gyms", icon: MapPin },
  { href: "/settings", label: "Settings", icon: Settings },
];
