import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { OnboardingForm } from "@/components/student/onboarding-form";

export const metadata = { title: "Complete your onboarding" };

export default async function StudentOnboardingPage() {
  const session = await requireRole("STUDENT");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.userId },
  });
  if (!profile) redirect("/auth/login");

  // Already onboarded (room assigned) → nothing to do here.
  if (profile.roomId) redirect("/student");

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-2">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Welcome, {profile.fullName.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Just a couple of quick steps to finish setting up your Ivy House
          account: tell us your room and add your next-of-kin details.
        </p>
      </div>

      <OnboardingForm
        defaults={{
          nextOfKinName: profile.nextOfKinName ?? "",
          nextOfKinPhone: profile.nextOfKinPhone ?? "",
          nextOfKinRelation: profile.nextOfKinRelation ?? "",
          guardianName: profile.guardianName ?? "",
          guardianPhone: profile.guardianPhone ?? "",
        }}
      />
    </div>
  );
}
