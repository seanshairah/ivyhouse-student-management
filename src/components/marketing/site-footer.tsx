import Link from "next/link";
import { Mail, Phone, MapPin, ArrowUpRight } from "lucide-react";

const EXPLORE = [
  { label: "The House", href: "/houses" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "FAQs", href: "/#faqs" },
  { label: "About", href: "/about" },
  { label: "Book a room", href: "/book" },
  { label: "Sign in", href: "/auth/login" },
];

const ROOM_TYPES = [
  { label: "Single rooms", href: "/houses/ivy-house" },
  { label: "Ensuite rooms", href: "/houses/ivy-house" },
  { label: "Shared rooms", href: "/houses/ivy-house" },
  { label: "Studio", href: "/houses/ivy-house" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-24 border-t border-border bg-background">
      <div className="container py-16 sm:py-20">
        {/* Editorial CTA line */}
        <div className="flex flex-col gap-6 border-b border-border pb-14 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="max-w-xl text-balance font-display text-4xl font-bold uppercase leading-[0.95] tracking-tight sm:text-5xl">
            Your room beside campus is waiting.
          </h2>
          <Link
            href="/book"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-sand-400 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-sand-500"
          >
            Book a room
            <ArrowUpRight className="size-4" />
          </Link>
        </div>

        <div className="grid gap-10 pt-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-sand-400 font-display text-sm font-extrabold text-white">
                I
              </span>
              <span className="font-display text-xl font-extrabold uppercase tracking-tight">
                Ivy House
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              A secure, verified student residence in Chinhoyi, a short walk from
              the CUT main campus. Apply online and manage everything from your
              portal.
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">
              Room types
            </h3>
            <ul className="space-y-2.5 text-sm">
              {ROOM_TYPES.map((r) => (
                <li key={r.label}>
                  <Link
                    href={r.href}
                    className="text-foreground/70 transition-colors hover:text-foreground"
                  >
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">
              Explore
            </h3>
            <ul className="space-y-2.5 text-sm">
              {EXPLORE.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-foreground/70 transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">
              Get in touch
            </h3>
            <ul className="space-y-3 text-sm text-foreground/70">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-sand-400" />
                <span>Off Magamba Way, Chinhoyi (near CUT main campus)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 shrink-0 text-sand-400" />
                <span>+263 77 000 0001</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0 text-sand-400" />
                <span>hello@ivyhouse.co.zw</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-2 py-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {year} Ivy House. All rights reserved.</p>
          <p>Student living in Chinhoyi · Beside the CUT main campus</p>
        </div>
      </div>
    </footer>
  );
}
