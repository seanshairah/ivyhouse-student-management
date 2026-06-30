"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeUp, staggerContainer } from "@/lib/animation-config";

export interface HeroHouse {
  name: string;
  location: string;
  imageUrl: string;
  insetImage: string;
  priceFrom: number;
  availableRooms: number;
}

const HERO_BG =
  "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=2000&q=80";

const AVATARS = ["RC", "TD", "NM", "BS"];

export function Hero({
  house,
  studentsHoused,
}: {
  house: HeroHouse;
  studentsHoused: number;
}) {
  return (
    <section className="px-3 pb-8 pt-2 sm:px-5 sm:pb-12">
      <div className="relative isolate overflow-hidden rounded-[1.75rem] border border-white/10 sm:rounded-[2.25rem]">
        <Image
          src={HERO_BG}
          alt={`${house.name} — student residence in Chinhoyi`}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* Scrims for legible text */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />

        <div className="relative z-10 flex min-h-[34rem] flex-col justify-between p-6 sm:min-h-[42rem] sm:p-10 lg:min-h-[44rem] lg:p-14">
          {/* Headline */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="max-w-3xl pt-10 sm:pt-16"
          >
            <motion.h1
              variants={fadeUp}
              className="font-display text-[2.7rem] uppercase leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl"
            >
              <span className="block font-extrabold">Student living,</span>
              <span className="block font-light">shaped for focus</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-6 max-w-md text-base leading-relaxed text-white/75 sm:text-lg"
            >
              Secure, verified rooms a 6-minute walk from the CUT main campus —
              built with comfort, clarity, and care.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" variant="white" className="rounded-full">
                <Link href="/book">
                  Book a room
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="glass" className="rounded-full">
                <Link href="/houses">
                  Explore the house
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </motion.div>
          </motion.div>

          {/* Bottom cluster */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
            className="flex flex-col items-start justify-between gap-6 pt-10 sm:flex-row sm:items-end"
          >
            {/* Avatars + stat */}
            <div>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3">
                  {AVATARS.map((a, i) => (
                    <span
                      key={a}
                      className="grid size-9 place-items-center rounded-full border-2 border-[#0c1110] bg-white/15 text-[0.7rem] font-semibold text-white ring-1 ring-white/20 backdrop-blur"
                      style={{ zIndex: AVATARS.length - i }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex items-end gap-3">
                <span className="font-display text-4xl font-extrabold text-white sm:text-5xl">
                  {studentsHoused}+
                </span>
                <span className="pb-1 text-sm leading-tight text-white/70">
                  Trusted by
                  <br />
                  happy students
                </span>
              </div>
              <div className="mt-3 h-px w-48 max-w-full bg-white/20" />
            </div>

            {/* Discover card */}
            <Link
              href="/houses"
              className="group flex w-full max-w-sm items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-md transition-colors hover:bg-white/15 sm:w-auto"
            >
              <span className="relative size-16 shrink-0 overflow-hidden rounded-xl">
                <Image
                  src={house.insetImage}
                  alt={house.name}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-sm font-semibold italic text-white">
                  Discover the rooms at {house.name}.
                </span>
                <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-white/80 underline-offset-4 group-hover:underline">
                  View rooms
                  <ArrowRight className="size-3.5" />
                </span>
              </span>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
