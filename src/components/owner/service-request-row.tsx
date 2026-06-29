"use client";

import { useState, useTransition } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { TableRow, TableCell } from "@/components/ui/table";
import { SERVICE_STATUS_META, PRIORITY_META } from "@/constants";
import { formatDate } from "@/lib/utils";
import { updateServiceRequest } from "@/app/owner/actions";

export interface ServiceRow {
  id: string;
  reference: string;
  title: string;
  status: string;
  priority: string;
  houseName: string;
  caretakerId: string | null;
  caretakerName: string | null;
  resolutionNotes: string | null;
  createdAt: string;
}

const STATUSES = Object.keys(SERVICE_STATUS_META);

export function ServiceRequestRow({
  request,
  caretakers,
}: {
  request: ServiceRow;
  caretakers: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await updateServiceRequest(formData);
      if (res.success) {
        toast.success("Service request updated");
        setOpen(false);
      } else {
        toast.error(res.error ?? "Failed");
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{request.reference}</TableCell>
      <TableCell className="font-medium">{request.title}</TableCell>
      <TableCell className="text-muted-foreground">{request.houseName}</TableCell>
      <TableCell>
        <StatusBadge meta={PRIORITY_META[request.priority]} />
      </TableCell>
      <TableCell>
        <StatusBadge meta={SERVICE_STATUS_META[request.status]} />
      </TableCell>
      <TableCell className="text-muted-foreground">{request.caretakerName ?? "Unassigned"}</TableCell>
      <TableCell className="text-muted-foreground">{formatDate(request.createdAt)}</TableCell>
      <TableCell className="text-right">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Settings2 className="size-4" /> Manage
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{request.title}</DialogTitle>
            </DialogHeader>
            <form action={onSubmit} className="space-y-4">
              <input type="hidden" name="id" value={request.id} />
              <div className="space-y-1.5">
                <Label htmlFor={`status-${request.id}`}>Status</Label>
                <Select id={`status-${request.id}`} name="status" defaultValue={request.status}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{SERVICE_STATUS_META[s].label}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`caretaker-${request.id}`}>Assign caretaker</Label>
                <Select id={`caretaker-${request.id}`} name="caretakerId" defaultValue={request.caretakerId ?? ""}>
                  <option value="">Unassigned</option>
                  {caretakers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`notes-${request.id}`}>Resolution notes</Label>
                <Textarea
                  id={`notes-${request.id}`}
                  name="resolutionNotes"
                  rows={3}
                  defaultValue={request.resolutionNotes ?? ""}
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}
