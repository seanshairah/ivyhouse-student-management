"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { STUDENT_STATUS_META } from "@/constants";
import { formatCurrency } from "@/lib/utils";

export interface StudentRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  houseId: string | null;
  houseName: string;
  roomNumber: string | null;
  status: string;
  balance: number;
}

const STATUSES = Object.keys(STUDENT_STATUS_META);

export function StudentsTable({
  students,
  houses,
}: {
  students: StudentRow[];
  houses: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [house, setHouse] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const q = query.toLowerCase();
      const matchesQuery =
        !q ||
        s.fullName.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q);
      const matchesHouse = house === "all" || s.houseId === house;
      const matchesStatus = status === "all" || s.status === status;
      return matchesQuery && matchesHouse && matchesStatus;
    });
  }, [students, query, house, status]);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name or email..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={house} onChange={(e) => setHouse(e.target.value)} className="w-auto">
              <option value="all">All houses</option>
              {houses.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STUDENT_STATUS_META[s].label}</option>
              ))}
            </Select>
          </div>
        </div>

        {filtered.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>House</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{s.houseName}</TableCell>
                  <TableCell className="text-muted-foreground">{s.roomNumber ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge meta={STUDENT_STATUS_META[s.status]} />
                  </TableCell>
                  <TableCell className={s.balance > 0 ? "font-medium text-rose-600" : ""}>
                    {formatCurrency(s.balance)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.phone}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/owner/students/${s.id}`}>
                        Open <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title="No students found" description="Adjust filters to see more." />
        )}
      </CardContent>
    </Card>
  );
}
