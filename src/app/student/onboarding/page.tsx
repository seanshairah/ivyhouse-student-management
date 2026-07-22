import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";
import { OnboardingForm, type RoomOption } from "@/components/student/onboarding-form";
import { RoomStatus } from "@prisma/client";

export const metadata = { title: "Complete your onboarding" };

export default async function StudentOnboardingPage() {
  const session = await requireRole("STUDENT");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.userId },
    include: { room: true },
  });
  if (!profile) redirect("/auth/login");

  // Already onboarded (room + next of kin present) → nothing to do here.
  const complete = Boolean(profile.roomId && profile.nextOfKinName);
  if (complete) redirect("/student");

  const rooms = await prisma.room.findMany({
    where: { status: { notIn: [RoomStatus.MAINTENANCE, RoomStatus.UNAVAILABLE] } },
    orderBy: [{ floor: "asc" }, { number: "asc" }],
    include: { house: { select: { name: true } } },
  });

  const options: RoomOption[] = rooms
    .map((r) => ({
      id: r.id,
      number: r.number,
      name: r.name,
      type: r.type,
      floor: r.floor,
      houseName: r.house?.name ?? "Ivy House",
      price: toNumber(r.price),
      remaining: Math.max(0, r.capacity - r.occupied),
      isCurrent: r.id === profile.roomId,
    }))
    // Keep rooms with space, plus the student's current room if they have one.
    .filter((r) => r.remaining > 0 || r.isCurrent);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-2">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Welcome, {profile.fullName.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Just two quick steps to finish setting up your Ivy House account:
          choose your room and add your next-of-kin details.
        </p>
      </div>

      <OnboardingForm
        rooms={options}
        defaults={{
          nextOfKinName: profile.nextOfKinName ?? "",
          nextOfKinPhone: profile.nextOfKinPhone ?? "",
          nextOfKinRelation: profile.nextOfKinRelation ?? "",
          guardianName: profile.guardianName ?? "",
          guardianPhone: profile.guardianPhone ?? "",
          roomId: profile.roomId ?? "",
        }}
      />
    </div>
  );
}
