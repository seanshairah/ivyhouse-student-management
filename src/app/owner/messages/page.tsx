import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { MessageComposer } from "@/components/owner/message-composer";

const MESSAGE_STATUS_META: Record<string, { label: string; color: string }> = {
  QUEUED: { label: "Queued", color: "amber" },
  SENT: { label: "Sent", color: "blue" },
  DELIVERED: { label: "Delivered", color: "emerald" },
  FAILED: { label: "Failed", color: "rose" },
};

export default async function OwnerMessagesPage() {
  await requireRole("OWNER");

  const [houses, logs, counts] = await Promise.all([
    prisma.house.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.messageLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.messageLog.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const total = counts.reduce((s, c) => s + c._count._all, 0);
  const sent = counts
    .filter((c) => c.status === "SENT" || c.status === "DELIVERED")
    .reduce((s, c) => s + c._count._all, 0);
  const failed = counts
    .filter((c) => c.status === "FAILED")
    .reduce((s, c) => s + c._count._all, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communication center"
        description="Send bulk messages to students and caretakers, and review delivery logs."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Messages sent" value={sent} icon="Send" accent="emerald" />
        <StatCard label="Total logged" value={total} icon="MessageSquare" accent="brand" />
        <StatCard label="Failed" value={failed} icon="AlertTriangle" accent="rose" />
      </div>

      <MessageComposer houses={houses} />

      <Card>
        <CardHeader>
          <CardTitle>Communication logs</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {logs.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <span className="font-medium">{l.recipientName ?? "—"}</span>
                      <span className="block text-xs text-muted-foreground">{l.recipient}</span>
                    </TableCell>
                    <TableCell>
                      <Badge color={l.channel === "EMAIL" ? "blue" : "brand"}>{l.channel}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {l.subject ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge meta={MESSAGE_STATUS_META[l.status]} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(l.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No messages yet" description="Sent messages will appear here." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
