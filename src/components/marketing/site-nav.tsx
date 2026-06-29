"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "The House", href: "/houses" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "FAQs", href: "/#faqs" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/#contact" },
];

export function SiteNav() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock scroll when mobile menu open
  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-border bg-background/95"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <nav className="container flex h-16 items-center justify-between gap-4 sm:h-20">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          onClick={() => setOpen(false)}
        >
          <span className="grid size-8 place-items-center rounded-lg bg-sand-400 font-display text-sm font-extrabold text-white">
            I
          </span>
          <span className="font-display text-xl font-extrabold uppercase tracking-tight text-foreground">
            Ivy House
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-foreground/70 transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/auth/login"
            className="text-sm text-foreground/70 transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Button asChild size="sm" variant="accent" className="rounded-full">
            <Link href="/book">Book a room</Link>
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid size-10 place-items-center rounded-full border border-border bg-white/70 lg:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden">
          <div className="container space-y-1 border-t border-border bg-background pb-6 pt-3">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-3 text-base text-foreground/90 transition-colors hover:bg-accent"
              >
                {l.label}
              </Link>
            ))}
            <div className="flex flex-col gap-2 pt-3">
              <Button
                asChild
                variant="outline"
                className="rounded-full"
                onClick={() => setOpen(false)}
              >
                <Link href="/auth/login">Sign in</Link>
              </Button>
              <Button
                asChild
                variant="accent"
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
