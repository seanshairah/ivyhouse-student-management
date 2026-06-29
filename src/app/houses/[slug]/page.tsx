import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RoomStatus } from "@prisma/client";
import { toNumber, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Check,
  ShieldCheck,
  Wrench,
  ScrollText,
  ArrowRight,
  BedDouble,
} from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { HouseGallery } from "@/components/marketing/house-gallery";

export const revalidate = 60; // ISR: cache for 60s for fast loads

const ROOM_TYPE_LABELS: Record<string, string> = {
  SINGLE: "Single",
  SHARED_DOUBLE: "Shared (Double)",
  SHARED_TRIPLE: "Shared (Triple)",
  ENSUITE: "En-suite",
  STUDIO: "Studio",
};

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const house = await prisma.house.findUnique({ where: { slug } });
  if (!house) return { title: "House not found" };
  return {
    title: house.name,
    description: house.tagline ?? house.description.slice(0, 150),
  };
}

export default async function HouseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const house = await prisma.house.findUnique({
    where: { slug },
    include: { rooms: { orderBy: { price: "asc" } } },
  });

  if (!house) notFound();

  const availableRooms = house.rooms.filter(
    (r) => r.status === RoomStatus.AVAILABLE,
  );
  const prices = house.rooms.map((r) => toNumber(r.price));
  const priceFrom = prices.length ? Math.min(...prices) : 0;

  const roomTypes = Array.from(new Set(house.rooms.map((r) => r.type)));

  // Gallery: prefer house.images, fall back to the cover image.
  const gallery =
    house.images && house.images.length > 0
      ? house.images
      : [house.imageUrl ?? FALLBACK_IMG];

  return (
    <SiteShell>
      {/* Header */}
      <section className="container pt-12 sm:pt-16">
        <div className="flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {availableRooms.length > 0
                ? `${availableRooms.length} room${
                    availableRooms.length === 1 ? "" : "s"
                  } available`
                : "Fully booked"}
            </span>
            <h1 className="mt-3 font-display text-5xl font-light leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              {house.name}
            </h1>
            {house.tagline && (
              <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
                {house.tagline}
              </p>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0 text-sand-400" />
            {house.location}
          </p>
        </div>
      </section>

      {/* Gallery */}
      <section className="container pt-8">
        <HouseGallery images={gallery} alt={house.name} />
      </section>

      <section className="container py-16">
        <div className="grid gap-12 lg:grid-cols-[1fr_20rem]">
          {/* Main content */}
          <div className="space-y-12">
            <div>
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
                About {house.name}
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground/80">
                {house.description}
              </p>
            </div>

            {/* Amenities & services */}
            <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
              {house.amenities.length > 0 && (
                <InfoList
                  icon={<Check className="size-4 text-foreground" strokeWidth={1.5} />}
                  title="Amenities"
                  items={house.amenities}
                />
              )}
              {house.services.length > 0 && (
                <InfoList
                  icon={<Wrench className="size-4 text-foreground" strokeWidth={1.5} />}
                  title="Services"
                  items={house.services}
                />
              )}
              {house.safetyInfo.length > 0 && (
                <InfoList
                  icon={<ShieldCheck className="size-4 text-foreground" strokeWidth={1.5} />}
                  title="Safety"
                  items={house.safetyInfo}
                />
              )}
              {house.rules.length > 0 && (
                <InfoList
                  icon={<ScrollText className="size-4 text-foreground" strokeWidth={1.5} />}
                  title="House rules"
                  items={house.rules}
                />
              )}
            </div>

            {/* Room types */}
            {roomTypes.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                  Room types
                </h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {roomTypes.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm"
                    >
                      <BedDouble className="size-4 text-sand-400" />
                      {ROOM_TYPE_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Available rooms list */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                Available rooms
              </h3>
              {availableRooms.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  All rooms are currently taken. Check back soon or contact us
                  to join the waitlist.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {availableRooms.map((room) => (
                    <div
                      key={room.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-brand-50/60"
                    >
                      <div>
                        <p className="font-medium">
                          Room {room.number}
                          {room.name ? ` · ${room.name}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ROOM_TYPE_LABELS[room.type] ?? room.type}
                          {room.floor ? ` · ${room.floor} floor` : ""}
                        </p>
                        <p className="mt-2 font-display text-lg font-semibold">
                          {formatCurrency(toNumber(room.price))}
                          <span className="text-xs font-normal text-muted-foreground">
                            {" "}
                            / month
                          </span>
                        </p>
                      </div>
                      <Button asChild size="sm" className="rounded-full">
                        <Link
                          href={`/book?house=${house.slug}&room=${room.id}`}
                        >
                          Book
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sticky sidebar CTA */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="bg-brand-900 p-6 text-brand-50">
                <p className="text-xs uppercase tracking-wider text-brand-300">
                  From
                </p>
                <p className="mt-1 font-display text-3xl font-light">
                  {formatCurrency(priceFrom)}
                  <span className="text-sm font-normal text-brand-300">
                    {" "}
                    / month
                  </span>
                </p>
              </div>
              <div className="space-y-4 p-6">
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <dt className="text-muted-foreground">Total rooms</dt>
                    <dd className="font-medium">{house.rooms.length}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Available now</dt>
                    <dd className="font-medium">{availableRooms.length}</dd>
                  </div>
                </dl>
                <Button asChild className="w-full rounded-full" size="lg">
                  <Link href={`/book?house=${house.slug}`}>
                    Book a room
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full rounded-full">
                  <Link href="/houses">Back to all houses</Link>
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </SiteShell>
  );
}

function InfoList({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <div className="bg-card p-6">
      <h3 className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2 text-sm text-foreground/80"
          >
            <Check className="mt-0.5 size-4 shrink-0 text-sand-400" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
