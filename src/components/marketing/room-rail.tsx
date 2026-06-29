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
    <section className="container py-16 sm:py-20">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={revealViewport}
        className="flex flex-col gap-4 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            The rooms
          </p>
          <h2 className="mt-3 max-w-xl text-balance font-display text-3xl font-bold uppercase tracking-tight sm:text-5xl">
            Find your room
          </h2>
        </div>
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
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
            className="group w-[78%] shrink-0 snap-start sm:w-auto"
          >
            <Link
              href={`/book?house=${room.houseSlug}&room=${room.id}`}
              className="relative block aspect-[4/5] w-full overflow-hidden rounded-2xl"
            >
              <Image
                src={room.imageUrl}
                alt={`${TYPE_LABELS[room.type] ?? room.type} — ${room.number}`}
                fill
                sizes="(max-width: 640px) 78vw, (max-width: 1024px) 50vw, 25vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-[0.7rem] font-medium backdrop-blur">
                <span
                  className={
                    room.available
                      ? "size-1.5 rounded-full bg-sand-400"
                      : "size-1.5 rounded-full bg-brand-300"
                  }
                />
                {room.available ? "Available" : "Reserved"}
              </span>
              <span className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-sand-400 text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <ArrowUpRight className="size-4" />
              </span>
            </Link>

            <div className="mt-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold tracking-tight">
                  {TYPE_LABELS[room.type] ?? room.type}
                </h3>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {room.number}
                  {room.floor ? ` · ${room.floor} floor` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-base font-bold">
                  {formatCurrency(room.price)}
                </p>
                <p className="text-[0.7rem] text-muted-foreground">/ month</p>
              </div>
            </div>

            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5 text-sand-400" />
              {room.capacity === 1
                ? "Private occupancy"
                : `Sleeps ${room.capacity}`}
            </p>
          </motion.article>
        ))}
      </motion.div>

      <div className="mt-10 flex justify-center">
        <Link
          href="/houses"
          className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          View the full house
          <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
