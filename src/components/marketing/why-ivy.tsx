"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen, ShieldCheck, Receipt, SlidersHorizontal } from "lucide-react";
import { fadeUp, staggerContainer, revealViewport } from "@/lib/animation-config";

const PILLARS = [
  {
    icon: BookOpen,
    title: "Purpose-built study spaces",
    description:
      "Dedicated study zones and quiet workspaces are built into the residence, creating a focused, distraction-free environment.",
    href: "/houses",
  },
  {
    icon: ShieldCheck,
    title: "Verified & secure living",
    description:
      "Every room is reviewed and verified, with 24/7 controlled access, CCTV and an on-site caretaker for genuine peace of mind.",
    href: "/about",
  },
  {
    icon: Receipt,
    title: "Transparent pricing",
    description:
      "Clear monthly rates with no hidden fees. Manage budgets confidently with invoices, receipts and statements in your portal.",
    href: "/#faqs",
  },
  {
    icon: SlidersHorizontal,
    title: "Flexible, student-centric options",
    description:
      "Choose from private rooms, shared rooms, ensuites or a studio — all a short walk from the CUT main campus.",
    href: "/houses",
  },
];

export function WhyIvy() {
  return (
    <section className="border-y border-border bg-secondary py-20 sm:py-28">
      <div className="container">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
          className="max-w-2xl"
        >
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Why Ivy House
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight sm:text-5xl">
            Everything a student needs to thrive.
          </h2>
          <p className="mt-4 text-muted-foreground">
            A safe, engaging and community-oriented residence — so you can
            concentrate on what really counts.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
          className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                variants={fadeUp}
                className="group flex flex-col rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
              >
                <span className="grid size-12 place-items-center rounded-full bg-sand-400 text-white shadow-sm shadow-sand-400/30">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold leading-snug">
                  {p.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {p.description}
                </p>
                <Link
                  href={p.href}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sand-500 transition-all hover:gap-2"
                >
                  Learn more →
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
