import { Download } from "lucide-react";
import { requireRole } from "@/lib/session";
import {
  getOverviewStats,
  getRevenueSeries,
  getOccupancyByHouse,
  getApplicationsByStatus,
  getOutstandingBalances,
  getHousePerformance,
} from "@/services/reports";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  RevenueAreaChart,
  OccupancyBarChart,
  StatusPieChart,
} from "@/components/charts/charts";
import { APPLICATION_STATUS_META } from "@/constants";

function ExportButton({ type }: { type: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={`/owner/reports/export?type=${type}`}>
        <Download className="size-4" /> Export CSV
      </a>
    </Button>
  );
}

export default async function OwnerReportsPage() {
  await requireRole("OWNER");

  const [stats, revenue, occupancy, appsByStatus, outstanding, performance] =
    await Promise.all([
      getOverviewStats(),
      getRevenueSeries(6),
      getOccupancyByHouse(),
      getApplicationsByStatus(),
      getOutstandingBalances(),
      getHousePerformance(),
    ]);

  const appStatusData = appsByStatus.map((a) => ({
    status: APPLICATION_STATUS_META[a.status]?.label ?? a.status,
    count: a.count,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Financial, occupancy and performance insights — export any section to CSV."
      />

      {/* Financial summary */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Financial summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total revenue" value={formatCurrency(stats.totalRevenue)} icon="DollarSign" accent="emerald" />
            <StatCard label="This month" value={formatCurrency(stats.monthlyRevenue)} icon="TrendingUp" accent="brand" />
            <StatCard label="Outstanding" value={formatCurrency(stats.outstanding)} icon="AlertTriangle" accent="rose" />
            <StatCard label="Occupancy" value={`${stats.occupancyRate}%`} icon="PieChart" accent="blue" />
          </div>
          <RevenueAreaChart data={revenue} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Occupancy report */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Occupancy report</CardTitle>
            <ExportButton type="occupancy" />
          </CardHeader>
          <CardContent className="space-y-4">
            <OccupancyBarChart data={occupancy} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>House</TableHead>
                  <TableHead>Occupied</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {occupancy.map((o) => (
                  <TableRow key={o.house}>
                    <TableCell className="font-medium">{o.house}</TableCell>
                    <TableCell>{o.occupied}</TableCell>
                    <TableCell>{o.available}</TableCell>
                    <TableCell>{o.rate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Applications report */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Applications by status</CardTitle>
            <ExportButton type="applications" />
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

      {/* Outstanding balances */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Outstanding balances</CardTitle>
          <ExportButton type="outstanding" />
        </CardHeader>
        <CardContent className="pt-0">
          {outstanding.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>House</TableHead>
                  <TableHead>Invoiced</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstanding.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell className="text-muted-foreground">{o.house}</TableCell>
                    <TableCell>{formatCurrency(o.due)}</TableCell>
                    <TableCell>{formatCurrency(o.paid)}</TableCell>
                    <TableCell className="font-medium text-rose-600">{formatCurrency(o.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No outstanding balances" description="All students are up to date." />
          )}
        </CardContent>
      </Card>

      {/* House performance */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>House performance</CardTitle>
          <ExportButton type="house-performance" />
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>House</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>Rooms</TableHead>
                <TableHead>Occupancy</TableHead>
                <TableHead>Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.map((p) => (
                <TableRow key={p.house}>
                  <TableCell className="font-medium">{p.house}</TableCell>
                  <TableCell>{p.students}</TableCell>
                  <TableCell>{p.rooms}</TableCell>
                  <TableCell>{p.occupancyRate}%</TableCell>
                  <TableCell>{formatCurrency(p.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
