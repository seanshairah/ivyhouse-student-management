"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Search, FileText, BadgeCheck, CreditCard, KeyRound } from "lucide-react";
import { howItWorks } from "@/data/houses";
import { fadeUp, revealViewport } from "@/lib/animation-config";

const STEP_ICONS = [Search, FileText, BadgeCheck, CreditCard, KeyRound];

export function HowItWorks() {
  const reduce = useReducedMotion();

  return (
    <section
      id="how-it-works"
      className="border-t border-white/10 bg-white/[0.02] scroll-mt-24 py-20 sm:py-28"
    >
      <div className="container">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400">
            How it works
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight text-white sm:text-5xl">
            Your ideal room in a few easy steps
          </h2>
          <p className="mt-4 text-white/60">
            A simple, transparent process — from browsing to moving in.
          </p>
        </motion.div>

        <div className="relative mt-16">
          {/* Connecting line (desktop) */}
          <div
            className="absolute left-0 right-0 top-7 hidden h-px bg-white/10 lg:block"
            aria-hidden
          />
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            {howItWorks.map((step, i) => {
              const Icon = STEP_ICONS[i] ?? Search;
              return (
                <motion.div
                  key={step.title}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{
                    duration: 0.5,
                    ease: [0.22, 1, 0.36, 1],
                    delay: i * 0.08,
                  }}
                  className="relative text-center"
                >
                  <div className="relative z-10 mx-auto grid size-14 place-items-center rounded-full bg-white text-brand-900 shadow-lg ring-8 ring-[#0d1210]">
                    <Icon className="size-6" />
                  </div>
                  <span className="mt-4 inline-block font-display text-xs font-bold uppercase tracking-wider text-amber-400">
                    Step {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-1 font-display text-lg font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="mx-auto mt-2 max-w-[15rem] text-sm leading-relaxed text-white/60">
                    {step.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
