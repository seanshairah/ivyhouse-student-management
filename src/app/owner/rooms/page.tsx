import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { toNumber } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { RoomsTable, type RoomRow } from "@/components/owner/rooms-table";

export default async function OwnerRoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ house?: string }>;
}) {
  await requireRole("OWNER");
  const { house } = await searchParams;

  const [rooms, houses] = await Promise.all([
    prisma.room.findMany({
      orderBy: [{ houseId: "asc" }, { number: "asc" }],
      include: { house: true },
    }),
    prisma.house.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows: RoomRow[] = rooms.map((r) => ({
    id: r.id,
    houseId: r.houseId,
    houseName: r.house.name,
    number: r.number,
    name: r.name,
    type: r.type,
    capacity: r.capacity,
    occupied: r.occupied,
    price: toNumber(r.price),
    status: r.status,
    floor: r.floor,
    description: r.description,
    images: r.images,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rooms"
        description="Add, edit and manage room availability across all houses."
      />
      <RoomsTable rooms={rows} houses={houses} initialHouse={house} />
    </div>
  );
}
