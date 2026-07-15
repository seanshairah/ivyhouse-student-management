"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { APPLICATION_STATUS_META } from "@/constants";
import { formatDate } from "@/lib/utils";

export interface ApplicationRow {
  id: string;
  reference: string;
  fullName: string;
  houseName: string;
  roomNumber: string | null;
  status: string;
  createdAt: string;
  type?: string;
}

const TABS: { value: string; label: string; statuses?: string[] }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New", statuses: ["NEW"] },
  { value: "review", label: "Awaiting Review", statuses: ["AWAITING_REVIEW"] },
  { value: "approved", label: "Approved", statuses: ["APPROVED"] },
  { value: "pending", label: "Payment Pending", statuses: ["PAYMENT_PENDING"] },
  { value: "paid", label: "Paid", statuses: ["PAID", "MOVED_IN"] },
  { value: "rejected", label: "Rejected", statuses: ["REJECTED", "CANCELLED"] },
];

export function ApplicationsTable({ applications }: { applications: ApplicationRow[] }) {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const def = TABS.find((t) => t.value === tab);
    return applications.filter((a) => {
      const matchesTab = !def?.statuses || def.statuses.includes(a.status);
      const q = query.toLowerCase();
      const matchesQuery =
        !q ||
        a.fullName.toLowerCase().includes(q) ||
        a.reference.toLowerCase().includes(q);
      return matchesTab && matchesQuery;
    });
  }, [applications, tab, query]);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name or reference..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {filtered.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>House</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.reference}</TableCell>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {a.fullName}
                      {a.type === "RENEWAL" && (
                        <Badge color="blue" className="text-[10px]">
                          Renewal
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{a.houseName}</TableCell>
                  <TableCell className="text-muted-foreground">{a.roomNumber ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge meta={APPLICATION_STATUS_META[a.status]} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(a.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/owner/applications/${a.id}`}>
                        Review <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title="No applications" description="No applications match this filter." />
        )}
      </CardContent>
    </Card>
  );
}
