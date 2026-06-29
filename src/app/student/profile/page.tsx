import { User, Wrench, GraduationCap } from "lucide-react";
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
import { ProfileForm } from "@/components/student/profile-form";
import { ServiceRequestForm } from "@/components/student/service-request-form";
import { formatDate } from "@/lib/utils";
import { STUDENT_STATUS_META, SERVICE_STATUS_META, PRIORITY_META } from "@/constants";

export default async function StudentProfilePage() {
  const session = await requireRole("STUDENT");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.userId },
    include: {
      house: true,
      room: true,
      serviceRequests: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Profile" />
        <EmptyState
          icon={<User className="size-5" />}
          title="No profile found"
          description="We couldn't load your student profile."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My profile" description="Your details and requests">
        <StatusBadge meta={STUDENT_STATUS_META[profile.status]} />
      </PageHeader>

      {/* Read-only details */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="size-4 text-brand-600" />
            <CardTitle className="text-base">Account details</CardTitle>
          </div>
          <CardDescription>These are managed by your house owner</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Full name" value={profile.fullName} />
          <Row label="Institution" value={profile.institution ?? "—"} />
          <Row label="Program" value={profile.program ?? "—"} />
          <Row label="Year of study" value={profile.yearOfStudy ?? "—"} />
          <Row label="House" value={profile.house?.name ?? "—"} />
          <Row
            label="Room"
            value={profile.room ? `Room ${profile.room.number}` : "—"}
          />
          <Row label="Lease start" value={formatDate(profile.leaseStart)} />
          <Row label="Lease end" value={formatDate(profile.leaseEnd)} />
          <Row label="Move-in date" value={formatDate(profile.moveInDate)} />
        </CardContent>
      </Card>

      {/* Editable contact form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact information</CardTitle>
          <CardDescription>Keep your contact details up to date</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            defaults={{
              phone: profile.phone ?? "",
              email: profile.email ?? "",
              nextOfKinName: profile.nextOfKinName ?? "",
              nextOfKinPhone: profile.nextOfKinPhone ?? "",
              nextOfKinRelation: profile.nextOfKinRelation ?? "",
              guardianName: profile.guardianName ?? "",
              guardianPhone: profile.guardianPhone ?? "",
            }}
          />
        </CardContent>
      </Card>

      {/* Service request */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="size-4 text-brand-600" />
            <CardTitle className="text-base">Submit a request</CardTitle>
          </div>
          <CardDescription>
            Report a maintenance issue or request a service for your house
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ServiceRequestForm houseId={profile.houseId} />
        </CardContent>
      </Card>

      {/* My requests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My requests</CardTitle>
          <CardDescription>Track your submitted requests</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.serviceRequests.length ? (
            profile.serviceRequests.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-xl border border-border p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.reference} · {formatDate(r.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge meta={PRIORITY_META[r.priority]} />
                  <StatusBadge meta={SERVICE_STATUS_META[r.status]} />
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={<Wrench className="size-5" />}
              title="No requests yet"
              description="Submit a request above and track it here."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value}</span>
    </div>
  );
}
