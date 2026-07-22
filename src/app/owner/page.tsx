import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  getOverviewStats,
  getRevenueSeries,
  getOccupancyByHouse,
  getApplicationsByStatus,
} from "@/services/reports";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import {
  RevenueAreaChart,
  OccupancyBarChart,
  StatusPieChart,
} from "@/components/charts/charts";
import {
  PAYMENT_STATUS_META,
  APPLICATION_STATUS_META,
} from "@/constants";

export default async function OwnerOverviewPage() {
  const session = await requireRole("OWNER");
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = session.name.split(" ")[0];
  const longDate = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  const [stats, revenue, occupancy, appsByStatus] = await Promise.all([
    getOverviewStats(),
    getRevenueSeries(6),
    getOccupancyByHouse(),
    getApplicationsByStatus(),
  ]);

  const [recentPayments, recentApplications, overdueCount] = await Promise.all([
    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { studentProfile: true },
    }),
    prisma.application.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { house: true },
    }),
    prisma.invoice.count({ where: { status: "OVERDUE" } }),
  ]);

  const appStatusData = appsByStatus.map((a) => ({
    status: APPLICATION_STATUS_META[a.status]?.label ?? a.status,
    count: a.count,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{longDate}</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
            {greeting}, {firstName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            <span>
              <strong className="font-semibold text-foreground">
                {stats.totalStudents}
              </strong>{" "}
              students
            </span>
            <span className="hidden h-3 w-px bg-border sm:block" />
            <span>
              <strong className="font-semibold text-foreground">
                {stats.occupancyRate}%
              </strong>{" "}
              occupancy
            </span>
            <span className="hidden h-3 w-px bg-border sm:block" />
            <span>
              <strong className="font-semibold text-foreground">
                {stats.pendingApplications}
              </strong>{" "}
              pending review
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/owner/reports">View reports</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/owner/applications">Review applications</Link>
        </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total students" value={stats.totalStudents} icon="Users" accent="brand" hint={`${stats.activeStudents} active`} />
        <StatCard
          label="Projected monthly income"
          value={formatCurrency(stats.expectedMonthlyIncome)}
          icon="TrendingUp"
          accent="emerald"
          hint="Rent + transport, per month"
        />
        <StatCard
          label="Expected rent / month"
          value={formatCurrency(stats.expectedMonthlyRent)}
          icon="DollarSign"
          accent="brand"
          hint={`${stats.housedStudents} of ${stats.totalStudents} with a room`}
        />
        <StatCard
          label="Transport / month"
          value={formatCurrency(stats.expectedMonthlyTransport)}
          icon="Bus"
          accent="blue"
          hint={`${stats.transportStudents} subscriber${stats.transportStudents === 1 ? "" : "s"}`}
        />
        <StatCard label="Received this month" value={formatCurrency(stats.monthlyRevenue)} icon="Wallet" accent="slate" hint="Deposits + payments" />
        <StatCard label="Outstanding balances" value={formatCurrency(stats.outstanding)} icon="AlertTriangle" accent="rose" />
        <StatCard label="Occupancy" value={`${stats.occupancyRate}%`} icon="PieChart" accent="slate" hint={`${stats.occupiedRooms} of ${stats.totalRooms} rooms`} />
        <StatCard label="Pending applications" value={stats.pendingApplications} icon="FileText" accent="amber" />
      </div>

      {/* Alerts */}
      {(stats.pendingApplications > 0 || overdueCount > 0) && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Bell className="size-5" />
              </div>
              <div>
                <p className="font-semibold">Upcoming actions</p>
                <p className="text-sm text-muted-foreground">
                  {stats.pendingApplications} application(s) awaiting review · {overdueCount} overdue invoice(s)
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {stats.pendingApplications > 0 && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/owner/applications">Review applications</Link>
                </Button>
              )}
              {overdueCount > 0 && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/owner/invoices">View overdue</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue (last 6 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart data={revenue} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Applications by status</CardTitle>
          </CardHeader>
          <CardContent>
            {appStatusData.length ? (
              <StatusPieChart data={appStatusData} />
            ) : (
              <EmptyState title="No applications yet" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Occupancy by house</CardTitle>
        </CardHeader>
        <CardContent>
          <OccupancyBarChart data={occupancy} />
        </CardContent>
      </Card>

      {/* Recent tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Recent payments</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/owner/payments">
                View all <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {recentPayments.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.studentProfile.fullName}</TableCell>
                      <TableCell>{formatCurrency(toNumber(p.amount))}</TableCell>
                      <TableCell>
                        <StatusBadge meta={PAYMENT_STATUS_META[p.status]} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState title="No payments yet" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Recent applications</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/owner/applications">
                View all <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {recentApplications.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applicant</TableHead>
                    <TableHead>House</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentApplications.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">{a.house.name}</TableCell>
                      <TableCell>
                        <StatusBadge meta={APPLICATION_STATUS_META[a.status]} />
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/owner/applications/${a.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={<AlertTriangle className="size-5" />}
                title="No applications yet"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
