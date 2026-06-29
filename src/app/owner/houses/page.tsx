import Link from "next/link";
import { MapPin, DoorOpen, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/misc";
import { HouseEditDialog } from "@/components/owner/house-edit-dialog";

function ChipRow({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Badge key={it} color="slate">{it}</Badge>
        ))}
      </div>
    </div>
  );
}

export default async function OwnerHousesPage() {
  await requireRole("OWNER");

  const houses = await prisma.house.findMany({
    orderBy: { name: "asc" },
    include: { rooms: true, caretakers: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Houses"
        description="Manage your properties, amenities and house information."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {houses.map((h) => {
          const capacity = h.rooms.reduce((s, r) => s + r.capacity, 0);
          const occupied = h.rooms.reduce((s, r) => s + r.occupied, 0);
          return (
            <Card key={h.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{h.name}</CardTitle>
                    {h.tagline && <CardDescription>{h.tagline}</CardDescription>}
                  </div>
                  <HouseEditDialog
                    house={{
                      id: h.id,
                      tagline: h.tagline,
                      description: h.description,
                      location: h.location,
                      imageUrl: h.imageUrl,
                      images: h.images,
                      amenities: h.amenities,
                      services: h.services,
                      rules: h.rules,
                      safetyInfo: h.safetyInfo,
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-4 pt-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" /> {h.location}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <DoorOpen className="size-4" /> {h.rooms.length} rooms
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4" /> {occupied}/{capacity} occupied
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <p className="text-sm text-muted-foreground">{h.description}</p>
                <Separator />
                <ChipRow label="Amenities" items={h.amenities} />
                <ChipRow label="Services" items={h.services} />
                <ChipRow label="Rules" items={h.rules} />
                <ChipRow label="Safety" items={h.safetyInfo} />
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Caretakers
                  </p>
                  {h.caretakers.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {h.caretakers.map((c) => (
                        <Badge key={c.id} color="brand">{c.name}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No caretakers assigned</p>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/owner/rooms?house=${h.id}`}>
                    Manage rooms <DoorOpen className="size-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
