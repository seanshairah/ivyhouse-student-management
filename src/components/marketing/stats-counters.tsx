"use client";

import * as React from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  animate,
} from "framer-motion";
import { fadeUp, staggerContainer, revealViewport } from "@/lib/animation-config";

export interface SiteStats {
  totalRooms: number;
  availableRooms: number;
  occupancyPct: number;
  students: number;
}

export function StatsCounters({ stats }: { stats: SiteStats }) {
  const items = [
    { value: stats.students, label: "Students housed", suffix: "" },
    { value: stats.totalRooms, label: "Rooms in the house", suffix: "" },
    { value: stats.availableRooms, label: "Rooms available now", suffix: "" },
    { value: stats.occupancyPct, label: "Occupancy", suffix: "%" },
  ];

  return (
    <section className="border-y border-white/10 bg-white/[0.02] text-white">
      <div className="container py-16 sm:py-20">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
          className="max-w-2xl"
        >
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400">
            Trusted by students
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold uppercase leading-[0.95] tracking-tight sm:text-5xl">
            Designed to support every aspect of student living.
          </h2>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
          className="mt-12 grid grid-cols-2 gap-y-10 lg:grid-cols-4"
        >
          {items.map((item) => (
            <motion.div
              key={item.label}
              variants={fadeUp}
              className="border-l border-white/15 pl-5"
            >
              <Counter value={item.value} suffix={item.suffix} />
              <p className="mt-2 text-xs uppercase tracking-wider text-white/50">
                {item.label}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Counter({ value, suffix }: { value: number; suffix: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value, reduce]);

  return (
    <span
      ref={ref}
      className="font-display text-5xl font-extrabold tracking-tight text-white sm:text-6xl"
    >
      {display}
      {suffix}
    </span>
  );
}
