"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
} from "@/components/ui/table";
import { SERVICE_STATUS_META } from "@/constants";
import { ServiceRequestRow, type ServiceRow } from "./service-request-row";
import { createServiceRequestOwner } from "@/app/owner/actions";

const STATUSES = Object.keys(SERVICE_STATUS_META);
const CATEGORIES = ["MAINTENANCE", "CLEANING", "UTILITY", "SECURITY", "REPAIR", "OTHER"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function ServiceBoard({
  requests,
  houses,
  caretakers,
}: {
  requests: ServiceRow[];
  houses: { id: string; name: string }[];
  caretakers: { id: string; name: string }[];
}) {
  const [status, setStatus] = useState("all");
  const [house, setHouse] = useState("all");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      requests.filter((r) => {
        const matchesStatus = status === "all" || r.status === status;
        const matchesHouse = house === "all" || r.houseName === house;
        return matchesStatus && matchesHouse;
      }),
    [requests, status, house],
  );

  function onCreate(formData: FormData) {
    startTransition(async () => {
      const res = await createServiceRequestOwner(formData);
      if (res.success) {
        toast.success("Service request created");
        setOpen(false);
      } else {
        toast.error(res.error ?? "Failed");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{SERVICE_STATUS_META[s].label}</option>
              ))}
            </Select>
            <Select value={house} onChange={(e) => setHouse(e.target.value)} className="w-auto">
              <option value="all">All houses</option>
              {houses.map((h) => (
                <option key={h.id} value={h.name}>{h.name}</option>
              ))}
            </Select>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" /> New request
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create service request</DialogTitle>
              </DialogHeader>
              <form action={onCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" rows={3} required />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="category">Category</Label>
                    <Select id="category" name="category" defaultValue="MAINTENANCE">
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="priority">Priority</Label>
                    <Select id="priority" name="priority" defaultValue="MEDIUM">
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="houseId">House</Label>
                    <Select id="houseId" name="houseId" defaultValue="">
                      <option value="">Unassigned</option>
                      {houses.map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="caretakerId">Caretaker</Label>
                    <Select id="caretakerId" name="caretakerId" defaultValue="">
                      <option value="">Unassigned</option>
                      {caretakers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {filtered.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>House</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Caretaker</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <ServiceRequestRow key={r.id} request={r} caretakers={caretakers} />
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title="No service requests" description="No requests match this filter." />
        )}
      </CardContent>
    </Card>
  );
}
