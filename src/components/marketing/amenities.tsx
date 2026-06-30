"use client";

import { motion } from "framer-motion";
import {
  Wifi,
  Zap,
  Droplets,
  ShieldCheck,
  Sparkles,
  Wrench,
  BookOpen,
  Users,
} from "lucide-react";
import { fadeUp, staggerContainer, revealViewport } from "@/lib/animation-config";

const ITEMS = [
  {
    icon: Wifi,
    title: "High-speed Wi-Fi",
    description: "Reliable fibre throughout, built for streaming and study.",
  },
  {
    icon: Zap,
    title: "Backup power",
    description: "Solar and generator backup keep you online and lit.",
  },
  {
    icon: Droplets,
    title: "Water 24/7",
    description: "Borehole and municipal supply with hot water around the clock.",
  },
  {
    icon: ShieldCheck,
    title: "24/7 security",
    description: "Controlled access, CCTV in common areas, and on-site care.",
  },
  {
    icon: Sparkles,
    title: "Cleaning service",
    description: "Regular cleaning of shared spaces so you can focus on study.",
  },
  {
    icon: Wrench,
    title: "Maintenance on request",
    description: "Report a fault and our team responds quickly.",
  },
  {
    icon: BookOpen,
    title: "Study lounges",
    description: "Quiet reading rooms and communal areas to work together.",
  },
  {
    icon: Users,
    title: "Friendly community",
    description: "A welcoming residence where it's easy to feel at home.",
  },
];

export function Amenities() {
  return (
    <section className="container py-20 sm:py-28">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={revealViewport}
        className="max-w-2xl"
      >
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400">
          Amenities &amp; services
        </p>
        <h2 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight text-white sm:text-5xl">
          Everything included.
        </h2>
        <p className="mt-4 text-white/60">
          Comfort, reliability, and care included with every room at Ivy House.
        </p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={revealViewport}
        className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4"
      >
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.title}
              variants={fadeUp}
              className="bg-[#0c1110] p-6 transition-colors hover:bg-white/[0.04]"
            >
              <span className="grid size-10 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15">
                <Icon className="size-5" strokeWidth={1.75} />
              </span>
              <h3 className="mt-4 font-display text-base font-semibold text-white">
                {item.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/60">
                {item.description}
              </p>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
