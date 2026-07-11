import Link from "next/link";
import {
  Bell,
  CreditCard,
  DoorOpen,
  Megaphone,
  ArrowRight,
  FileText,
} from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStudentBalance } from "@/services/invoices";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { PayButton } from "@/components/student/pay-button";
import { EcocashPayDialog } from "@/components/student/ecocash-pay-dialog";
import { formatCurrency, formatDate, formatDateTime, toNumber } from "@/lib/utils";
import {
  APPLICATION_STATUS_META,
  SEMESTER_MONTHS,
  TRANSPORT_FEE,
  DEFAULT_MONTHLY_RENT,
} from "@/constants";
import { PaymentStatus } from "@prisma/client";

export default async function StudentHomePage() {
  const session = await requireRole("STUDENT");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.userId },
    include: { house: true, room: true },
  });

  const [latestApp, balance, pendingPayment, announcements, unread] =
    await Promise.all([
      prisma.application.findFirst({
        where: { email: profile?.email ?? session.email },
        orderBy: { createdAt: "desc" },
        include: { house: true, room: true },
      }),
      profile
        ? getStudentBalance(profile.id)
        : Promise.resolve({ totalDue: 0, totalPaid: 0, balance: 0 }),
      profile
        ? prisma.payment.findFirst({
            where: { studentProfileId: profile.id, status: PaymentStatus.PENDING },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve(null),
      prisma.announcement.findMany({
        where: {
          OR: [
            { audience: "ALL" },
            ...(profile?.houseId
              ? [{ audience: "HOUSE" as const, houseId: profile.houseId }]
              : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
      prisma.notification.findMany({
        where: { userId: session.userId, isRead: false },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
    ]);

  const firstName = (profile?.fullName ?? session.name).split(" ")[0];
  const monthly = profile?.room ? toNumber(profile.room.price) : DEFAULT_MONTHLY_RENT;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's an overview of your accommodation."
      />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Outstanding balance"
          value={formatCurrency(balance.balance)}
          icon="Wallet"
          accent={balance.balance > 0 ? "rose" : "emerald"}
          hint={balance.balance > 0 ? "Amount due" : "You're all paid up"}
        />
        <StatCard
          label="Your room"
          value={profile?.room ? `Room ${profile.room.number}` : "Not assigned"}
          icon="DoorOpen"
          accent="brand"
          hint={profile?.house?.name ?? "No house yet"}
        />
        <StatCard
          label="Status"
          value={
            APPLICATION_STATUS_META[latestApp?.status ?? ""]?.label ??
            (profile ? "Active" : "Prospect")
          }
          icon="BadgeCheck"
          accent="blue"
          hint="Application status"
        />
      </div>

      {/* Pay now banner */}
      {pendingPayment && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <CreditCard className="size-5" />
              </div>
              <div>
                <p className="font-semibold">Payment pending</p>
                <p className="text-sm text-muted-foreground">
                  You have a pending payment of{" "}
                  {formatCurrency(Number(pendingPayment.amount))}.
                </p>
              </div>
            </div>
            <PayButton reference={pendingPayment.reference} size="default" />
          </CardContent>
        </Card>
      )}

      {/* Pay for accommodation & services */}
      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>Pay for accommodation &amp; services</CardTitle>
            <CardDescription>
              Instant EcoCash payments — enter your number and approve the prompt
              on your phone.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <EcocashPayDialog
              purpose="RENT_MONTH"
              amount={monthly}
              title="Next month's rent"
              triggerLabel={`Next month · ${formatCurrency(monthly)}`}
              defaultPhone={profile.phone}
            />
            <EcocashPayDialog
              purpose="RENT_SEMESTER"
              amount={monthly * SEMESTER_MONTHS}
              title="Next semester's rent"
              triggerLabel={`Next semester · ${formatCurrency(monthly * SEMESTER_MONTHS)}`}
              defaultPhone={profile.phone}
              variant="outline"
            />
            <EcocashPayDialog
              purpose="TRANSPORT"
              amount={TRANSPORT_FEE}
              title="Transport service"
              triggerLabel={`Transport · ${formatCurrency(TRANSPORT_FEE)}`}
              defaultPhone={profile.phone}
              variant="outline"
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Application / assignment */}
        <Card>
          <CardHeader>
            <CardTitle>Application</CardTitle>
            <CardDescription>Your latest application</CardDescription>
          </CardHeader>
          <CardContent>
            {latestApp ? (
              <div className="space-y-3 text-sm">
                <Row label="Reference" value={latestApp.reference} />
                <Row label="House" value={latestApp.house?.name ?? "—"} />
                <Row
                  label="Room"
                  value={latestApp.room ? `Room ${latestApp.room.number}` : "—"}
                />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge meta={APPLICATION_STATUS_META[latestApp.status]} />
                </div>
                <Row label="Submitted" value={formatDate(latestApp.createdAt)} />
              </div>
            ) : (
              <EmptyState
                icon={<FileText className="size-5" />}
                title="No application yet"
                description="Explore Ivy House and apply for a room."
                action={
                  <Button asChild variant="brand" size="sm">
                    <Link href="/houses">Explore the house</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Assigned house + room */}
        <Card>
          <CardHeader>
            <CardTitle>Your accommodation</CardTitle>
            <CardDescription>Assigned house &amp; room</CardDescription>
          </CardHeader>
          <CardContent>
            {profile?.house && profile?.room ? (
              <div className="space-y-3 text-sm">
                <Row label="House" value={profile.house.name} />
                <Row label="Location" value={profile.house.location} />
                <Row label="Room" value={`Room ${profile.room.number}`} />
                <Row
                  label="Rent"
                  value={formatCurrency(Number(profile.room.price))}
                />
                <div className="pt-1">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/student/room">
                      View room details
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<DoorOpen className="size-5" />}
                title="No room assigned"
                description="Once your application is approved and paid, your room will appear here."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Announcements */}
        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
            <CardDescription>Latest updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcements.length ? (
              announcements.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-border p-3.5"
                >
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
                description="You're all caught up."
              />
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              {unread.length ? `${unread.length} unread` : "Nothing new"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {unread.length ? (
              unread.map((n) => (
                <Link
                  key={n.id}
                  href={n.link ?? "/student"}
                  className="block rounded-xl border border-border p-3.5 transition-colors hover:bg-accent"
                >
                  <div className="flex items-start gap-2.5">
                    <Bell className="mt-0.5 size-4 shrink-0 text-brand-600" />
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {n.body}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState
                icon={<Bell className="size-5" />}
                title="No new notifications"
                description="We'll let you know when something happens."
              />
            )}
          </CardContent>
        </Card>
      </div>
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
