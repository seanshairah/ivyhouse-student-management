"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, MapPin, CalendarDays, Wallet, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { fadeUp, staggerContainer } from "@/lib/animation-config";

export interface HeroHouse {
  name: string;
  location: string;
  imageUrl: string;
  insetImage: string;
  priceFrom: number;
  availableRooms: number;
}

export function Hero({
  house,
  priceFrom,
}: {
  house: HeroHouse;
  priceFrom: number;
}) {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden">
      <div className="container pb-12 pt-8 sm:pb-16 sm:pt-12">
        {/* Top label row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-between border-b border-border pb-6"
        >
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Student residence · Chinhoyi
          </span>
          <span className="hidden text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            Beside the CUT main campus
          </span>
        </motion.div>

        {/* Editorial headline */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid gap-8 pt-10 sm:pt-14 lg:grid-cols-[1.55fr_1fr] lg:items-end"
        >
          <motion.h1
            variants={fadeUp}
            className="font-display text-[3.25rem] font-extrabold uppercase leading-[0.92] tracking-tight sm:text-7xl lg:text-[6.25rem]"
          >
            Student
            <br />
            living at{" "}
            <span className="text-accent-gradient">Ivy House</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="max-w-sm text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            Secure, verified rooms a 6-minute walk from the Chinhoyi University
            of Technology main campus — fast Wi-Fi, backup power and on-site
            care, all booked online.
          </motion.p>
        </motion.div>

        {/* Search / filter bar */}
        <motion.form
          action="/book"
          method="get"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-9 grid gap-3 rounded-[1.4rem] border border-border bg-card p-3 shadow-sm sm:mt-12 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end sm:rounded-full sm:p-2.5 sm:pl-5"
        >
          <Field icon={MapPin} label="Location">
            <input
              name="q"
              defaultValue="Chinhoyi, near CUT"
              className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
            />
          </Field>
          <Field icon={CalendarDays} label="Move-in" className="sm:border-l sm:border-border sm:pl-5">
            <input
              name="movein"
              type="text"
              onFocus={(e) => (e.currentTarget.type = "date")}
              placeholder="Choose a date"
              className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
            />
          </Field>
          <Field icon={Wallet} label="Budget" className="sm:border-l sm:border-border sm:pl-5">
            <select
              name="budget"
              defaultValue=""
              className="w-full cursor-pointer bg-transparent text-sm font-medium text-foreground outline-none"
            >
              <option value="">Any budget</option>
              <option value="150">Up to $150 / mo</option>
              <option value="200">Up to $200 / mo</option>
              <option value="300">Up to $300 / mo</option>
            </select>
          </Field>
          <Button type="submit" variant="accent" size="lg" className="rounded-full">
            <Search className="size-4" />
            Discover
          </Button>
        </motion.form>

        {/* Large hero image with floating label cards */}
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          className="relative mt-12 sm:mt-16"
        >
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl sm:aspect-[16/9]">
            <Image
              src={house.imageUrl}
              alt={`Interior of ${house.name}`}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>

          {/* Floating availability card */}
          <div className="absolute left-4 top-4 rounded-2xl border border-border bg-background/90 px-4 py-3 backdrop-blur sm:left-6 sm:top-6">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <span className="size-1.5 rounded-full bg-sand-400" />
              Now leasing
            </p>
            <p className="mt-0.5 font-display text-base font-semibold">
              Rooms from {formatCurrency(priceFrom)} / mo
            </p>
          </div>

          {/* Floating CTA + inset card */}
          <div className="absolute -bottom-6 right-4 hidden w-52 overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-brand-900/10 sm:block lg:w-60">
            <div className="relative aspect-[4/3] w-full">
              <Image
                src={house.insetImage}
                alt="Communal study lounge"
                fill
                sizes="240px"
                className="object-cover"
              />
            </div>
            <div className="flex items-center justify-between px-3.5 py-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {house.availableRooms} rooms open
                </p>
                <p className="text-sm font-medium">Book a viewing</p>
              </div>
              <Link
                href="/book"
                aria-label="Book a room"
                className="grid size-9 place-items-center rounded-full bg-sand-400 text-white transition-colors hover:bg-sand-500"
              >
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Field({
  icon: Icon,
  label,
  className = "",
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex items-center gap-3 rounded-2xl px-3 py-2 sm:rounded-none sm:px-0 sm:py-1 ${className}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {children}
      </span>
    </label>
  );
}
