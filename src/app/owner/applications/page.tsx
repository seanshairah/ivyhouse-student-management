import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  ApplicationsTable,
  type ApplicationRow,
} from "@/components/owner/applications-table";

export default async function OwnerApplicationsPage() {
  await requireRole("OWNER");

  const applications = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    include: { house: true, room: true },
  });

  const rows: ApplicationRow[] = applications.map((a) => ({
    id: a.id,
    reference: a.reference,
    fullName: a.fullName,
    houseName: a.house.name,
    roomNumber: a.room?.number ?? null,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    type: a.type,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Review, approve and respond to housing applications."
      />
      <ApplicationsTable applications={rows} />
    </div>
  );
}
