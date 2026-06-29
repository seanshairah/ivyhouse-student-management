import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { RoomStatus } from "@prisma/client";
import { toNumber, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MapPin, Check, ArrowUpRight } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";

export const revalidate = 60; // ISR: cache for 60s for fast loads

export const metadata: Metadata = {
  title: "The House",
  description:
    "Explore Ivy House — amenities, services, room types, and live room availability, a short walk from the CUT main campus.",
};

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80";

export default async function HousesPage() {
  const houses = await prisma.house.findMany({
    orderBy: { name: "asc" },
    include: { rooms: { orderBy: { price: "asc" } } },
  });

  return (
    <SiteShell>
      <section className="container pb-8 pt-12 sm:pt-20">
        <div className="border-b border-border pb-6">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            The residence
          </span>
        </div>
        <div className="grid gap-8 pt-10 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <h1 className="max-w-3xl text-balance font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            Find the right room for you.
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Ivy House is fully serviced and secure. Explore the amenities and
            live room availability below.
          </p>
        </div>
      </section>

      <section className="container pb-24">
        <div className="space-y-20 pt-12">
          {houses.map((house, idx) => {
            const available = house.rooms.filter(
              (r) => r.status === RoomStatus.AVAILABLE,
            );
            const prices = house.rooms.map((r) => toNumber(r.price));
            const priceFrom = prices.length ? Math.min(...prices) : 0;

            return (
              <article
                key={house.id}
                className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
              >
                <Link
                  href={`/houses/${house.slug}`}
                  className={`group relative block aspect-[4/3] w-full overflow-hidden rounded-3xl ${
                    idx % 2 === 1 ? "lg:order-2" : ""
                  }`}
                >
                  <Image
                    src={house.imageUrl ?? FALLBACK_IMG}
                    alt={house.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-xs font-medium backdrop-blur">
                    <span
                      className={
                        available.length > 0
                          ? "size-1.5 rounded-full bg-sand-400"
                          : "size-1.5 rounded-full bg-brand-300"
                      }
                    />
                    {available.length > 0
                      ? `${available.length} room${
                          available.length === 1 ? "" : "s"
                        } available`
                      : "Fully booked"}
                  </span>
                </Link>

                <div>
                  <h2 className="font-display text-4xl font-light tracking-tight sm:text-5xl">
                    {house.name}
                  </h2>
                  {house.tagline && (
                    <p className="mt-3 text-lg text-muted-foreground">
                      {house.tagline}
                    </p>
                  )}
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="size-4 shrink-0 text-sand-400" />
                    {house.location}
                  </p>

                  <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                    {house.description}
                  </p>

                  {house.amenities.length > 0 && (
                    <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {house.amenities.slice(0, 6).map((a) => (
                        <li
                          key={a}
                          className="flex items-center gap-2 text-sm text-foreground/80"
                        >
                          <Check className="size-4 shrink-0 text-sand-400" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">
                        From
                      </span>
                      <span className="font-display text-3xl font-light">
                        {formatCurrency(priceFrom)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        / month
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild variant="outline" className="rounded-full">
                        <Link href={`/houses/${house.slug}`}>
                          View details
                        </Link>
                      </Button>
                      <Button asChild variant="accent" className="rounded-full">
                        <Link href={`/book?house=${house.slug}`}>
                          Book
                          <ArrowUpRight className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </SiteShell>
  );
}
