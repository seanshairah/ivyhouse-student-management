"use client";

import { useState, useTransition } from "react";
import { CalendarClock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requestRenewalAction } from "@/app/student/actions";

interface RoomOption {
  id: string;
  label: string;
}

export function RenewalForm({
  currentRoom,
  availableRooms,
  pendingTerm,
}: {
  currentRoom: RoomOption;
  availableRooms: RoomOption[];
  pendingTerm: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await requestRenewalAction(formData);
      if (res.success) {
        toast.success("Renewal request submitted — we'll review it shortly.");
        setOpen(false);
      } else {
        toast.error(res.error ?? "Could not submit renewal");
      }
    });
  }

  // If a renewal is already in progress, show its status instead of the form.
  if (pendingTerm) {
    return (
      <Card className="border-brand-200 bg-brand-50/40">
        <CardContent className="flex items-start gap-3 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <CalendarClock className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Renewal in progress</p>
            <p className="text-sm text-muted-foreground">
              Your request to renew for{" "}
              <span className="font-medium text-foreground">{pendingTerm}</span>{" "}
              is being processed. We'll notify you by email and SMS on any update.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Renew or extend your stay</CardTitle>
        <CardDescription>
          Staying for another semester? Request to keep your room or move to a
          different one — it goes through the same quick approval.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="brand">
              <RefreshCw className="size-4" /> Request renewal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Renew your stay</DialogTitle>
              <DialogDescription>
                Choose your room and the term you're renewing for. We'll review
                and send you a payment request to confirm.
              </DialogDescription>
            </DialogHeader>
            <form action={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="roomId">Room</Label>
                <Select id="roomId" name="roomId" defaultValue={currentRoom.id}>
                  <option value={currentRoom.id}>
                    Keep my current room — {currentRoom.label}
                  </option>
                  {availableRooms.length > 0 && (
                    <optgroup label="Move to a different room">
                      {availableRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="requestedTerm">Renewing for</Label>
                <Input
                  id="requestedTerm"
                  name="requestedTerm"
                  placeholder="e.g. Semester 2, 2026"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  placeholder="Anything we should know?"
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={pending}>
                  {pending ? "Submitting..." : "Submit request"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
