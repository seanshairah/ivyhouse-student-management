"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Search, MoreHorizontal, Archive, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ROOM_STATUS_META } from "@/constants";
import { formatCurrency } from "@/lib/utils";
import { RoomFormDialog, type RoomFormData } from "./room-form-dialog";
import { changeRoomStatus, archiveRoom } from "@/app/owner/actions";

export interface RoomRow {
  id: string;
  houseId: string;
  houseName: string;
  number: string;
  name: string | null;
  type: string;
  capacity: number;
  occupied: number;
  price: number;
  status: string;
  floor: string | null;
  description: string | null;
  images?: string[];
}

const STATUSES = Object.keys(ROOM_STATUS_META);

export function RoomsTable({
  rooms,
  houses,
  initialHouse,
}: {
  rooms: RoomRow[];
  houses: { id: string; name: string }[];
  initialHouse?: string;
}) {
  const [query, setQuery] = useState("");
  const [house, setHouse] = useState(initialHouse ?? "all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("number");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let list = rooms.filter((r) => {
      const q = query.toLowerCase();
      const matchesQuery =
        !q ||
        r.number.toLowerCase().includes(q) ||
        (r.name ?? "").toLowerCase().includes(q);
      const matchesHouse = house === "all" || r.houseId === house;
      const matchesStatus = status === "all" || r.status === status;
      return matchesQuery && matchesHouse && matchesStatus;
    });
    list = [...list].sort((a, b) => {
      if (sort === "price") return b.price - a.price;
      if (sort === "status") return a.status.localeCompare(b.status);
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    });
    return list;
  }, [rooms, query, house, status, sort]);

  function runStatus(id: string, value: string) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", value);
    startTransition(async () => {
      const res = await changeRoomStatus(fd);
      if (res.success) toast.success("Status updated");
      else toast.error(res.error ?? "Failed");
    });
  }

  function runArchive(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await archiveRoom(fd);
      if (res.success) toast.success("Room archived");
      else toast.error(res.error ?? "Failed");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search number or name..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={house} onChange={(e) => setHouse(e.target.value)} className="w-auto">
              <option value="all">All houses</option>
              {houses.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{ROOM_STATUS_META[s].label}</option>
              ))}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto">
              <option value="number">Sort: Number</option>
              <option value="price">Sort: Price</option>
              <option value="status">Sort: Status</option>
            </Select>
            <RoomFormDialog
              houses={houses}
              trigger={
                <Button size="sm">
                  <Plus className="size-4" /> Add room
                </Button>
              }
            />
          </div>
        </div>

        {filtered.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>House</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Occupancy</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.number}
                    {r.name && <span className="block text-xs text-muted-foreground">{r.name}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.houseName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.type.replace(/_/g, " ")}</TableCell>
                  <TableCell>{r.occupied}/{r.capacity}</TableCell>
                  <TableCell>{formatCurrency(r.price)}</TableCell>
                  <TableCell>
                    <StatusBadge meta={ROOM_STATUS_META[r.status]} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <RoomFormDialog
                        houses={houses}
                        room={r as RoomFormData}
                        trigger={
                          <Button variant="ghost" size="icon" title="Edit">
                            <Pencil className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={pending}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Change status</DropdownMenuLabel>
                          {STATUSES.map((s) => (
                            <DropdownMenuItem key={s} onClick={() => runStatus(r.id, s)}>
                              {ROOM_STATUS_META[s].label}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-rose-600"
                            onClick={() => runArchive(r.id)}
                          >
                            <Archive className="size-4" /> Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title="No rooms found" description="Try adjusting filters or add a new room." />
        )}
      </CardContent>
    </Card>
  );
}
