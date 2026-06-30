"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowUpRight, Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { fadeUp, staggerContainer, revealViewport } from "@/lib/animation-config";

const TYPE_LABELS: Record<string, string> = {
  SINGLE: "Single room",
  SHARED_DOUBLE: "Shared double",
  SHARED_TRIPLE: "Shared triple",
  ENSUITE: "Ensuite",
  STUDIO: "Studio",
};

export interface RailRoom {
  id: string;
  number: string;
  type: string;
  floor: string | null;
  price: number;
  capacity: number;
  available: boolean;
  imageUrl: string;
  houseSlug: string;
}

export function RoomRail({
  rooms,
  priceFrom,
}: {
  rooms: RailRoom[];
  priceFrom: number;
}) {
  if (!rooms.length) return null;

  return (
    <section className="container py-16 sm:py-24">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={revealViewport}
        className="flex flex-col gap-4 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400">
            The rooms
          </p>
          <h2 className="mt-3 max-w-xl text-balance font-display text-3xl font-bold uppercase tracking-tight text-white sm:text-5xl">
            Find your room
          </h2>
        </div>
        <p className="max-w-xs text-sm leading-relaxed text-white/60">
          Fully serviced rooms from {formatCurrency(priceFrom)} / month — every
          listing is verified, secure and a short walk from campus.
        </p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={revealViewport}
        className="no-scrollbar -mx-6 mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4"
      >
        {rooms.map((room) => (
          <motion.article
            key={room.id}
            variants={fadeUp}
            className="group w-[78%] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] sm:w-auto"
          >
            <Link
              href={`/book?house=${room.houseSlug}&room=${room.id}`}
              className="relative block aspect-[4/3] w-full overflow-hidden"
            >
              <Image
                src={room.imageUrl}
                alt={`${TYPE_LABELS[room.type] ?? room.type} — ${room.number}`}
                fill
                sizes="(max-width: 640px) 78vw, (max-width: 1024px) 50vw, 25vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[0.7rem] font-medium text-white backdrop-blur">
                <span
                  className={
                    room.available
                      ? "size-1.5 rounded-full bg-amber-400"
                      : "size-1.5 rounded-full bg-white/40"
                  }
                />
                {room.available ? "Available" : "Reserved"}
              </span>
              <span className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-white text-brand-900 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <ArrowUpRight className="size-4" />
              </span>
            </Link>

            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold tracking-tight text-white">
                    {TYPE_LABELS[room.type] ?? room.type}
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-white/55">
                    {room.number}
                    {room.floor ? ` · ${room.floor} floor` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-base font-bold text-white">
                    {formatCurrency(room.price)}
                  </p>
                  <p className="text-[0.7rem] text-white/55">/ month</p>
                </div>
              </div>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/60">
                <Users className="size-3.5 text-amber-400" />
                {room.capacity === 1 ? "Private occupancy" : `Sleeps ${room.capacity}`}
              </p>
            </div>
          </motion.article>
        ))}
      </motion.div>

      <div className="mt-10 flex justify-center">
        <Link
          href="/houses"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          View the full house
          <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
