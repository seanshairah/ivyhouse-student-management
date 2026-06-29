import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ShieldCheck,
  HeartHandshake,
  Sparkles,
  Building2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteShell } from "@/components/marketing/site-shell";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Ivy House — how our Chinhoyi student residence is run, and the standard of care behind every room.",
};

const ABOUT_IMG =
  "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=1400&q=80";

const VALUES = [
  {
    icon: ShieldCheck,
    title: "Safe & secure",
    description:
      "Controlled access, CCTV at entrances, an electric fence, and an on-site caretaker, day and night.",
  },
  {
    icon: HeartHandshake,
    title: "Genuinely cared for",
    description:
      "A responsive management team that treats every resident like part of the community.",
  },
  {
    icon: Sparkles,
    title: "Comfortable & reliable",
    description:
      "Fast Wi-Fi, backup power, hot water, and regular cleaning so you can focus on your studies.",
  },
  {
    icon: Building2,
    title: "Simple to manage",
    description:
      "Apply online, pay securely, and handle everything from your student portal afterwards.",
  },
];

export default function AboutPage() {
  return (
    <SiteShell>
      <section className="container pb-12 pt-12 sm:pt-20">
        <div className="border-b border-border pb-6">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            About us
          </span>
        </div>
        <div className="grid gap-12 pt-10 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <h1 className="max-w-3xl text-balance font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            Student living built around{" "}
            <span className="text-accent-gradient">people</span>.
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Ivy House is a welcoming residence in Chinhoyi, a short walk from the
            CUT main campus, designed to make student life easier. From the first
            click to move-in day, everything is online, transparent, and handled
            by a team that cares.
          </p>
        </div>

        <div className="relative mt-12 aspect-[16/9] w-full overflow-hidden rounded-3xl">
          <Image
            src={ABOUT_IMG}
            alt="Modern residence architecture"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      </section>

      <section className="container pb-8 pt-8">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
          {VALUES.map((v) => {
            const Icon = v.icon;
            return (
              <div key={v.title} className="bg-card p-7">
                <Icon className="size-5 text-foreground" strokeWidth={1.5} />
                <h2 className="mt-4 font-display text-xl font-medium">
                  {v.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {v.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="container py-16 sm:py-24">
        <div className="flex flex-col items-start gap-6 border-t border-border pt-14 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="max-w-lg text-balance font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
              Find your room today.
            </h2>
            <p className="mt-4 max-w-md text-muted-foreground">
              Explore Ivy House, pick an available room, and apply in minutes.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link href="/houses">View the house</Link>
            </Button>
            <Button asChild size="lg" variant="accent" className="rounded-full">
              <Link href="/book">
                Book a room
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
