import { Home, Megaphone, MapPin } from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

export default async function CaretakerHomePage() {
  const session = await requireRole("CARETAKER");
  const caretaker = await prisma.caretaker.findFirst({
    where: { OR: [{ userId: session.userId }, { email: session.email }] },
    include: { house: true },
  });

  const houseFilter = caretaker?.houseId
    ? { houseId: caretaker.houseId }
    : {};

  const [openCount, inProgressCount, resolvedCount, announcements] =
    await Promise.all([
      prisma.serviceRequest.count({
        where: { ...houseFilter, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      }),
      prisma.serviceRequest.count({
        where: { ...houseFilter, status: "IN_PROGRESS" },
      }),
      prisma.serviceRequest.count({
        where: { ...houseFilter, status: { in: ["RESOLVED", "CLOSED"] } },
      }),
      prisma.announcement.findMany({
        where: {
          OR: [
            { audience: "ALL" },
            { audience: "CARETAKERS" },
            ...(caretaker?.houseId
              ? [{ audience: "HOUSE" as const, houseId: caretaker.houseId }]
              : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const firstName = (caretaker?.name ?? session.name).split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hi, ${firstName}`}
        description="Your assigned house and tasks at a glance."
      />

      {/* Assigned house */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Home className="size-4 text-brand-600" />
            <CardTitle className="text-base">Assigned house</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {caretaker?.house ? (
            <div className="space-y-2 text-sm">
              <p className="font-display text-lg font-semibold">
                {caretaker.house.name}
              </p>
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="size-4" />
                {caretaker.house.location}
              </p>
              {caretaker.role && (
                <p className="text-muted-foreground">Role: {caretaker.role}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No specific house assigned — you can see all service requests.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Counts */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open" value={openCount} icon="Inbox" accent="blue" />
        <StatCard
          label="In progress"
          value={inProgressCount}
          icon="Loader"
          accent="amber"
        />
        <StatCard
          label="Resolved"
          value={resolvedCount}
          icon="CheckCircle2"
          accent="emerald"
        />
      </div>

      {/* Announcements */}
      <Card>
        <CardHeader>
          <CardTitle>Announcements</CardTitle>
          <CardDescription>Updates from the owner</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {announcements.length ? (
            announcements.map((a) => (
              <div key={a.id} className="rounded-xl border border-border p-3.5">
                <div className="flex items-start gap-2.5">
                  <Megaphone className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {a.body}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(a.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={<Megaphone className="size-5" />}
              title="No announcements"
              description="Nothing new from the owner."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
