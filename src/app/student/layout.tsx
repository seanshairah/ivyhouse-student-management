import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  DashboardShell,
  type ShellNavItem,
} from "@/components/navigation/dashboard-shell";

const FULL_NAV: ShellNavItem[] = [
  { label: "Home", href: "/student", icon: "Home" },
  { label: "Payments", href: "/student/payments", icon: "CreditCard" },
  { label: "Room", href: "/student/room", icon: "DoorOpen" },
  { label: "Messages", href: "/student/messages", icon: "MessageSquare" },
  { label: "Profile", href: "/student/profile", icon: "User" },
];

// During onboarding (rent not yet paid) the student is restricted to payments.
const ONBOARDING_NAV: ShellNavItem[] = [
  { label: "Pay rent", href: "/student/payments", icon: "CreditCard" },
];

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("STUDENT");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.userId },
    select: { fullName: true, email: true, status: true },
  });

  const user = {
    name: profile?.fullName ?? session.name,
    email: profile?.email ?? session.email,
  };

  // Payment gate: a newly-approved student (APPLICANT) must pay rent before
  // accessing the rest of the dashboard. Once payment settles they become
  // ACTIVE and the gate lifts automatically.
  const onboarding = profile?.status === "APPLICANT";
  const pathname = (await headers()).get("x-pathname") ?? "";
  const onPaymentRoute = pathname.startsWith("/student/payments");
  // Gate only when we know the path (set by middleware) to avoid any redirect loop.
  if (onboarding && pathname && !onPaymentRoute) {
    redirect("/student/payments");
  }

  return (
    <DashboardShell
      nav={onboarding ? ONBOARDING_NAV : FULL_NAV}
      mobileNav={onboarding ? ONBOARDING_NAV : FULL_NAV}
      brand="Ivy House"
      roleLabel="Student"
      user={user}
    >
      {onboarding && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <CreditCard className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold">Activate your account</p>
            <p className="text-amber-800">
              Welcome! Please pay your rent below to activate your account and
              unlock your full dashboard. Your room is reserved while you
              complete payment.
            </p>
          </div>
        </div>
      )}
      {children}
    </DashboardShell>
  );
}
