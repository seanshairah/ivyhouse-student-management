import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { toNumber, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/misc";
import { APPLICATION_STATUS_META } from "@/constants";
import { ApplicationReview } from "@/components/owner/application-review";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value || "—"}</p>
    </div>
  );
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("OWNER");
  const { id } = await params;

  const app = await prisma.application.findUnique({
    where: { id },
    include: { house: true, room: true, studentProfile: true },
  });
  if (!app) notFound();

  const availableRooms = await prisma.room.findMany({
    where: { status: "AVAILABLE" },
    include: { house: true },
    orderBy: [{ houseId: "asc" }, { number: "asc" }],
  });

  const decided = ["APPROVED", "REJECTED", "PAYMENT_PENDING", "PAID", "MOVED_IN", "CANCELLED"].includes(app.status);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/owner/applications">
          <ArrowLeft className="size-4" /> Back to applications
        </Link>
      </Button>

      <PageHeader
        title={app.fullName}
        description={
          app.type === "RENEWAL"
            ? `Renewal · Reference ${app.reference}${app.requestedTerm ? ` · ${app.requestedTerm}` : ""}`
            : `Reference ${app.reference}`
        }
      >
        {app.type === "RENEWAL" && <Badge color="blue">Renewal</Badge>}
        <StatusBadge meta={APPLICATION_STATUS_META[app.status]} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Applicant details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" value={app.email} />
              <Field label="Phone" value={app.phone} />
              <Field label="National ID" value={app.nationalId} />
              <Field label="Age" value={app.age ? String(app.age) : null} />
              <Field label="Gender" value={app.gender} />
              <Field label="Institution" value={app.institution} />
              <Field label="Program" value={app.program} />
              <Field label="Year of study" value={app.yearOfStudy} />
              <Field label="House" value={app.house.name} />
              <Field label="Room" value={app.room?.number} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next of kin & guardian</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Next of kin" value={app.nextOfKinName} />
              <Field label="NOK phone" value={app.nextOfKinPhone} />
              <Field label="Relationship" value={app.nextOfKinRelation} />
              <Field label="Guardian" value={app.guardianName} />
              <Field label="Guardian phone" value={app.guardianPhone} />
            </CardContent>
          </Card>

          {(app.specialNotes || app.medicalNeeds || app.reviewNotes) && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {app.specialNotes && <Field label="Special notes" value={app.specialNotes} />}
                {app.medicalNeeds && <Field label="Medical needs" value={app.medicalNeeds} />}
                {app.reviewNotes && <Field label="Review notes" value={app.reviewNotes} />}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Decision</CardTitle>
            </CardHeader>
            <CardContent>
              <ApplicationReview
                applicationId={app.id}
                currentRoomId={app.roomId}
                availableRooms={availableRooms.map((r) => ({
                  id: r.id,
                  label: `${r.house.name} · Room ${r.number} · ${formatPrice(toNumber(r.price))}`,
                }))}
                decided={decided}
                status={app.status}
                type={app.type}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Submitted</span>
                <span>{formatDateTime(app.createdAt)}</span>
              </div>
              <Separator />
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Current status</span>
                <StatusBadge meta={APPLICATION_STATUS_META[app.status]} />
              </div>
              {app.decidedAt && (
                <>
                  <Separator />
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Decided</span>
                    <span>{formatDateTime(app.decidedAt)}</span>
                  </div>
                </>
              )}
              {app.studentProfile && (
                <>
                  <Separator />
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href={`/owner/students/${app.studentProfile.id}`}>View student profile</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatPrice(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
