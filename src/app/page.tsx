import { prisma } from "@/lib/prisma";
import { RoomStatus } from "@prisma/client";
import { toNumber } from "@/lib/utils";
import { SiteShell } from "@/components/marketing/site-shell";
import { Hero } from "@/components/marketing/hero";
import { RoomRail, type RailRoom } from "@/components/marketing/room-rail";
import { StatsCounters } from "@/components/marketing/stats-counters";
import { WhyIvy } from "@/components/marketing/why-ivy";
import { Amenities } from "@/components/marketing/amenities";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Faq } from "@/components/marketing/faq";
import { Contact } from "@/components/marketing/contact";

export const revalidate = 60; // ISR: cache for 60s for fast loads

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80";

export default async function HomePage() {
  const house = await prisma.house.findFirst({
    orderBy: { createdAt: "asc" },
    include: { rooms: { orderBy: { price: "asc" } } },
  });

  const rooms = house?.rooms ?? [];
  const prices = rooms.map((r) => toNumber(r.price));
  const priceFrom = prices.length ? Math.min(...prices) : 0;
  const available = rooms.filter((r) => r.status === RoomStatus.AVAILABLE);

  // Featured rooms for the showcase rail — prefer available, fall back to all.
  const featured: RailRoom[] = (available.length ? available : rooms)
    .slice(0, 8)
    .map((r, i) => ({
      id: r.id,
      number: r.number,
      type: r.type,
      floor: r.floor,
      price: toNumber(r.price),
      capacity: r.capacity,
      available: r.status === RoomStatus.AVAILABLE,
      imageUrl:
        (house?.images?.length
          ? house.images[i % house.images.length]
          : house?.imageUrl) ?? FALLBACK_IMG,
      houseSlug: house?.slug ?? "ivy-house",
    }));

  const heroHouse = {
    name: house?.name ?? "Ivy House",
    location: house?.location ?? "Chinhoyi",
    imageUrl: house?.imageUrl ?? FALLBACK_IMG,
    insetImage: house?.images?.[1] ?? FALLBACK_IMG,
    priceFrom,
    availableRooms: available.length,
  };

  // Aggregate stats
  const totalCapacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
  const totalOccupied = rooms.reduce((sum, r) => sum + r.occupied, 0);
  const students = await prisma.studentProfile.count();
  const stats = {
    totalRooms: rooms.length,
    availableRooms: available.length,
    occupancyPct: totalCapacity
      ? Math.round((totalOccupied / totalCapacity) * 100)
      : 0,
    students,
  };

  return (
    <SiteShell>
      <Hero house={heroHouse} priceFrom={priceFrom} />
      <RoomRail rooms={featured} priceFrom={priceFrom} />
      <StatsCounters stats={stats} />
      <WhyIvy />
      <Amenities />
      <HowItWorks />
      <Faq />
      <Contact />
    </SiteShell>
  );
}
