import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { toNumber, formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SendCredentialsPanel } from "@/components/owner/send-credentials-panel";

export const metadata = { title: "Onboarding" };

export default async function OwnerOnboardingPage() {
  await requireRole("OWNER");

  const studentWhere = { user: { role: "STUDENT" as const, isActive: true } };
  const [total, sent, pending, onboarded, deposits] = await Promise.all([
    prisma.studentProfile.count({ where: studentWhere }),
    prisma.studentProfile.count({ where: { ...studentWhere, credentialsSentAt: { not: null } } }),
    prisma.studentProfile.count({ where: { ...studentWhere, credentialsSentAt: null } }),
    prisma.studentProfile.count({ where: { ...studentWhere, roomId: { not: null } } }),
    prisma.payment.aggregate({ where: { status: "PAID", method: "CASH" }, _sum: { amount: true } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding"
        description="Send login credentials to imported students and track their onboarding."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={total} icon="Users" accent="blue" />
        <StatCard label="Credentials sent" value={sent} icon="MailCheck" accent="emerald" />
        <StatCard
          label="Awaiting credentials"
          value={pending}
          icon="Send"
          accent={pending > 0 ? "amber" : "emerald"}
          hint={pending > 0 ? "Action available" : "All sent"}
        />
        <StatCard
          label="Deposits recorded"
          value={formatCurrency(toNumber(deposits._sum.amount ?? 0))}
          icon="Wallet"
          accent="brand"
        />
      </div>

      <SendCredentialsPanel pending={pending} />

      <Card>
        <CardHeader>
          <CardTitle>How onboarding works</CardTitle>
          <CardDescription>What each student goes through</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">1. Credentials sent.</strong> Each student gets a
            unique temporary password by SMS (and email once your domain is verified). Sending
            rotates to a fresh password each time, so re-sends always work.
          </p>
          <p>
            <strong className="text-foreground">2. First login.</strong> They&apos;re required to set
            their own password before anything else.
          </p>
          <p>
            <strong className="text-foreground">3. Onboarding.</strong> They enter their room number
            and type (single / 2-share / 3-share) and next-of-kin details, which activates their
            account. {onboarded} of {total} have completed this.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
