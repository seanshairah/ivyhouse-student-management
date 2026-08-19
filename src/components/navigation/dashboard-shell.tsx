"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";
import { LogoutButton } from "./logout-button";
import { logoutAction } from "@/app/auth/actions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export interface ShellNavItem {
  label: string;
  href: string;
  icon: keyof typeof Icons;
}

interface DashboardShellProps {
  nav: ShellNavItem[];
  mobileNav: ShellNavItem[];
  brand: string;
  roleLabel: string;
  user: { name: string; email: string };
  children: React.ReactNode;
}

function Icon({ name, className }: { name: keyof typeof Icons; className?: string }) {
  const Cmp = Icons[name] as React.ComponentType<{ className?: string }>;
  return Cmp ? <Cmp className={className} /> : null;
}

function isActive(pathname: string, href: string) {
  if (href.split("/").length <= 2) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function DashboardShell({
  nav,
  mobileNav,
  brand,
  roleLabel,
  user,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // The tab bar fits about five targets. Everything else lives behind "More" —
  // layouts used to point that at a single page, which left most of the
  // dashboard (onboarding, rooms, reports…) unreachable on a phone.
  const primaryMobile = mobileNav
    .filter((i) => i.label.toLowerCase() !== "more")
    .slice(0, 4);
  const showMore = nav.some((i) => !primaryMobile.some((p) => p.href === i.href));

  // Navigating away should not leave the sheet covering the new page.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-card transition-all duration-300 lg:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl gradient-accent font-display text-sm font-extrabold text-white">
            I
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold leading-tight">{brand}</p>
              <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3 no-scrollbar">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-sand-600"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  collapsed && "justify-center",
                )}
              >
                <Icon name={item.icon} className="size-5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <LogoutButton collapsed={collapsed} />
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            <Icons.PanelLeft className="size-5 shrink-0" />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className={cn("transition-all duration-300", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex size-8 items-center justify-center rounded-lg gradient-accent font-display text-xs font-extrabold text-white">
              I
            </div>
            <span className="font-display text-sm font-bold">{brand}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/"
              className="hidden rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-primary sm:block"
            >
              View site
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-xl p-1 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar name={user.name} className="size-8" />
                <div className="hidden text-right leading-tight sm:block">
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="max-w-[160px] truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <Icons.ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[14rem]">
                <DropdownMenuLabel>
                  <p className="font-semibold text-foreground">{user.name}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {user.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/">
                    <Icons.Globe className="size-4" /> View public site
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <form action={logoutAction} className="w-full">
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 text-rose-600"
                    >
                      <Icons.LogOut className="size-4" /> Sign out
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="px-4 pb-28 pt-6 lg:px-8 lg:pb-10">{children}</main>
      </div>

      {/* Mobile "More" sheet — every destination in the dashboard. */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              All sections
            </p>
            <div className="grid grid-cols-2 gap-2">
              {nav.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border border-border px-3 py-3 text-sm font-medium transition-colors",
                      active ? "bg-accent text-sand-600" : "text-foreground",
                    )}
                  >
                    <Icon name={item.icon} className="size-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground"
              >
                View public site
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600"
                >
                  <Icons.LogOut className="size-4" /> Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-border bg-card lg:hidden">
        {primaryMobile.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-sand-600" : "text-muted-foreground",
              )}
            >
              <Icon name={item.icon} className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {showMore && (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
              menuOpen ? "text-sand-600" : "text-muted-foreground",
            )}
          >
            <Icons.Menu className="size-5" />
            <span>More</span>
          </button>
        )}
      </nav>
    </div>
  );
}
