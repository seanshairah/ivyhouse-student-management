"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Home as HomeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "Home", href: "/" },
  { label: "The House", href: "/houses" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "FAQs", href: "/#faqs" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/#contact" },
];

export function SiteNav() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href.split("#")[0]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-white/10 bg-[#0c1110]/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <nav className="container flex h-16 items-center justify-between gap-4 sm:h-20">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5"
          onClick={() => setOpen(false)}
        >
          <span className="grid size-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <HomeIcon className="size-5 text-white" />
          </span>
          <span className="font-display text-xl font-bold tracking-tight text-white">
            Ivy House
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "text-sm transition-colors",
                  active
                    ? "font-semibold text-amber-400"
                    : "text-white/70 hover:text-white",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/auth/login"
            className="text-sm text-white/70 transition-colors hover:text-white"
          >
            Sign in
          </Link>
          <Button asChild size="sm" variant="white" className="rounded-full px-5">
            <Link href="/book">Book a room</Link>
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid size-10 place-items-center rounded-full border border-white/15 bg-white/10 text-white lg:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden">
          <div className="container space-y-1 border-t border-white/10 bg-[#0c1110] pb-6 pt-3">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-3 text-base text-white/90 transition-colors hover:bg-white/5"
              >
                {l.label}
              </Link>
            ))}
            <div className="flex flex-col gap-2 pt-3">
              <Button
                asChild
                variant="glass"
                className="rounded-full"
                onClick={() => setOpen(false)}
              >
                <Link href="/auth/login">Sign in</Link>
              </Button>
              <Button
                asChild
                variant="white"
                className="rounded-full"
                onClick={() => setOpen(false)}
              >
                <Link href="/book">Book a room</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
