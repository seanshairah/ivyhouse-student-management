import { Wrench } from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { ServiceStatusForm } from "@/components/caretaker/service-status-form";
import { formatDate } from "@/lib/utils";
import { SERVICE_STATUS_META, PRIORITY_META } from "@/constants";

const CATEGORY_LABELS: Record<string, string> = {
  MAINTENANCE: "Maintenance",
  CLEANING: "Cleaning",
  UTILITY: "Utility",
  SECURITY: "Security",
  REPAIR: "Repair",
  OTHER: "Other",
};

export default async function CaretakerServicesPage() {
  const session = await requireRole("CARETAKER");
  const caretaker = await prisma.caretaker.findFirst({
    where: { OR: [{ userId: session.userId }, { email: session.email }] },
    select: { houseId: true },
  });

  const requests = await prisma.serviceRequest.findMany({
    where: caretaker?.houseId ? { houseId: caretaker.houseId } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { studentProfile: { select: { fullName: true } }, house: { select: { name: true } } },
  });

  const active = requests.filter(
    (r) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(r.status),
  );
  const closed = requests.filter((r) =>
    ["RESOLVED", "CLOSED", "CANCELLED"].includes(r.status),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service requests"
        description="Track and update maintenance tasks for your house."
      />

      <Card>
        <CardHeader>
          <CardTitle>Active</CardTitle>
          <CardDescription>
            {active.length
              ? `${active.length} request${active.length === 1 ? "" : "s"} need attention`
              : "Nothing needs attention right now"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {active.length ? (
            active.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))
          ) : (
            <EmptyState
              icon={<Wrench className="size-5" />}
              title="No active requests"
              description="You're all caught up."
            />
          )}
        </CardContent>
      </Card>

      {closed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>Resolved, closed & cancelled</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {closed.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RequestCard({
  request: r,
}: {
  request: {
    id: string;
    reference: string;
    title: string;
    description: string;
    category: string;
    priority: string;
    status: string;
    createdAt: Date;
    resolutionNotes: string | null;
    studentProfile: { fullName: string } | null;
    house: { name: string } | null;
  };
}) {
  return (
    <div className="grid gap-4 rounded-xl border border-border p-4 lg:grid-cols-[1fr_220px]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{r.title}</p>
          <StatusBadge meta={PRIORITY_META[r.priority]} />
          <StatusBadge meta={SERVICE_STATUS_META[r.status]} />
        </div>
        <p className="text-sm text-muted-foreground">{r.description}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{CATEGORY_LABELS[r.category] ?? r.category}</span>
          {r.studentProfile && <span>By {r.studentProfile.fullName}</span>}
          {r.house && <span>{r.house.name}</span>}
          <span>{r.reference}</span>
          <span>{formatDate(r.createdAt)}</span>
        </div>
      </div>
      <ServiceStatusForm
        id={r.id}
        currentStatus={r.status}
        currentNotes={r.resolutionNotes}
      />
    </div>
  );
}
