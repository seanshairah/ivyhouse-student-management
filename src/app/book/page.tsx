import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { RoomStatus } from "@prisma/client";
import { toNumber } from "@/lib/utils";
import { SiteShell } from "@/components/marketing/site-shell";
import { BookingForm, type BookingHouse } from "./booking-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a Room",
  description:
    "Apply for a room at Ivy House in Chinhoyi. Choose an available room and submit your application in minutes.",
};

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ house?: string; room?: string }>;
}) {
  const { house: houseParam, room: roomParam } = await searchParams;

  const houses = await prisma.house.findMany({
    orderBy: { name: "asc" },
    include: { rooms: { orderBy: { price: "asc" } } },
  });

  const data: BookingHouse[] = houses.map((h) => ({
    id: h.id,
    name: h.name,
    slug: h.slug,
    rooms: h.rooms.map((r) => ({
      id: r.id,
      number: r.number,
      name: r.name,
      type: r.type,
      floor: r.floor,
      price: toNumber(r.price),
      available: r.status === RoomStatus.AVAILABLE,
    })),
  }));

  // Resolve preselection from slug + room id.
  const preHouse = houseParam
    ? data.find((h) => h.slug === houseParam || h.id === houseParam)
    : undefined;
  const preRoom =
    roomParam && preHouse
      ? preHouse.rooms.find((r) => r.id === roomParam && r.available)
      : undefined;

  return (
    <SiteShell>
      <section className="container py-12 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Apply online
            </p>
            <h1 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-tight sm:text-5xl">
              Book your room
            </h1>
            <p className="mt-4 text-muted-foreground">
              It takes a few minutes. Your room is held while we review — you
              pay only after approval.
            </p>
          </div>

          <div className="mt-10">
            <BookingForm
              houses={data}
              initialHouseId={preHouse?.id ?? ""}
              initialRoomId={preRoom?.id ?? ""}
            />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
