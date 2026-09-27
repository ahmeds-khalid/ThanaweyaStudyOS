"use client";

import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/store/data";
import { ui, useUi } from "@/lib/store/ui";
import { cn } from "@/lib/utils";
import { MORE_NAV, MOBILE_PRIMARY, NAV, SETTINGS_NAV, type NavItem } from "./nav";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function NavButton({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const t = useT();
  const Icon = item.icon;
  const label = t(item.key);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} tooltip={label}>
        <Link href={item.href}>
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Tablets start with the icon-only rail; wide screens start expanded. */
function CollapseOnTablet() {
  const { setOpen } = useSidebar();
  useEffect(() => {
    if (window.innerWidth < 1024) setOpen(false);
  }, [setOpen]);
  return null;
}

/** Desktop and tablet navigation (shadcn Sidebar). Phones use MobileNav below. */
export function AppSidebar() {
  const settings = useSettings();
  return (
    <Sidebar collapsible="icon">
      <CollapseOnTablet />
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Study OS">
              <Link href="/">
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <GraduationCap className="size-4" />
                </span>
                <span className="grid flex-1 text-start leading-tight">
                  <span className="truncate text-sm font-semibold">Study OS</span>
                  <span className="truncate text-xs text-muted-foreground">{settings.profile.academicYear}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV.map((item) => (
              <NavButton key={item.href} item={item} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <NavButton item={SETTINGS_NAV} />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function MoreLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const t = useT();
  const Icon = item.icon;
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={() => ui.setMobileNav(false)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {t(item.key)}
    </Link>
  );
}

/** Phone navigation: a bottom bar, with "More" opening a shadcn Sheet. */
export function MobileNav() {
  const t = useT();
  const pathname = usePathname();
  const open = useUi((s) => s.mobileNavOpen);
  const language = useSettings().general.language;

  return (
    <>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {MOBILE_PRIMARY.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium", active ? "text-foreground" : "text-muted-foreground")}
            >
              <Icon className="size-5" aria-hidden />
              {t(item.key)}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => ui.setMobileNav(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground"
          aria-expanded={open}
        >
          <span className="flex size-5 flex-col items-center justify-center gap-[3px]" aria-hidden>
            <span className="h-0.5 w-4 rounded bg-current" />
            <span className="h-0.5 w-4 rounded bg-current" />
            <span className="h-0.5 w-4 rounded bg-current" />
          </span>
          {t("nav.more")}
        </button>
      </nav>
      <Sheet open={open} onOpenChange={ui.setMobileNav}>
        <SheetContent side={language === "ar" ? "right" : "left"} className="w-72 max-w-[85vw] gap-2 bg-sidebar p-3 md:hidden">
          <SheetHeader className="p-0 pe-8">
            <SheetTitle>More</SheetTitle>
            <SheetDescription className="sr-only">Other pages</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1">
            {MORE_NAV.map((item) => (
              <MoreLink key={item.href} item={item} />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
