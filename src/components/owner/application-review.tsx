"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, HelpCircle, Send, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
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
import {
  approveApp,
  rejectApp,
  requestInfo,
  sendApplicantMessage,
  confirmMoveInAction,
} from "@/app/owner/actions";

interface RoomOption {
  id: string;
  label: string;
}

export function ApplicationReview({
  applicationId,
  currentRoomId,
  availableRooms,
  decided,
  status,
  type,
}: {
  applicationId: string;
  currentRoomId: string | null;
  availableRooms: RoomOption[];
  decided: boolean;
  status?: string;
  type?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  function wrap(fn: () => Promise<{ success: boolean; error?: string }>, ok: string, close?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        toast.success(ok);
        close?.();
      } else {
        toast.error(res.error ?? "Something went wrong");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {/* Approve */}
        <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
          <DialogTrigger asChild>
            <Button disabled={decided || pending}>
              <CheckCircle2 className="size-4" /> Approve
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve application</DialogTitle>
              <DialogDescription>
                Confirm the room and invoice amount. The applicant will receive a payment link.
              </DialogDescription>
            </DialogHeader>
            <form
              action={(fd) =>
                wrap(() => approveApp(fd), "Application approved", () => setApproveOpen(false))
              }
              className="space-y-4"
            >
              <input type="hidden" name="id" value={applicationId} />
              <div className="space-y-1.5">
                <Label htmlFor="roomId">Assign room</Label>
                <Select id="roomId" name="roomId" defaultValue={currentRoomId ?? ""}>
                  {currentRoomId && <option value={currentRoomId}>Keep current room</option>}
                  <option value="">— Select a room —</option>
                  {availableRooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  Leave on current room or reassign from available rooms.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">Invoice amount (optional override)</Label>
                <Input id="amount" name="amount" type="number" min={0} step="0.01" placeholder="Defaults to room price" />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={pending}>
                  {pending ? "Approving..." : "Approve & invoice"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Reject */}
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" disabled={decided || pending}>
              <XCircle className="size-4" /> Reject
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject application</DialogTitle>
              <DialogDescription>The applicant will be notified. Provide a reason.</DialogDescription>
            </DialogHeader>
            <form
              action={(fd) =>
                wrap(() => rejectApp(fd), "Application rejected", () => setRejectOpen(false))
              }
              className="space-y-4"
            >
              <input type="hidden" name="id" value={applicationId} />
              <div className="space-y-1.5">
                <Label htmlFor="reason">Reason</Label>
                <Textarea id="reason" name="reason" rows={3} placeholder="Reason for rejection" />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">Cancel</Button>
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={pending}>
                  {pending ? "Rejecting..." : "Confirm reject"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {/* Confirm move-in (after payment) — new students only; renewals are
            finalised automatically when payment settles. */}
        {status === "PAID" && type !== "RENEWAL" && (
          <form
            action={(fd) =>
              wrap(() => confirmMoveInAction(fd), "Move-in confirmed")
            }
          >
            <input type="hidden" name="id" value={applicationId} />
            <Button type="submit" variant="brand" disabled={pending}>
              <KeyRound className="size-4" /> Confirm move-in
            </Button>
          </form>
        )}
      </div>

      {/* Request more info */}
      <form
        action={(fd) => wrap(() => requestInfo(fd), "Request sent to applicant")}
        className="space-y-2 rounded-xl border border-border p-4"
      >
        <input type="hidden" name="id" value={applicationId} />
        <Label htmlFor="info" className="flex items-center gap-1.5">
          <HelpCircle className="size-4" /> Request more information
        </Label>
        <Textarea id="info" name="message" rows={2} placeholder="What do you need from the applicant?" required />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          <Send className="size-4" /> Send request
        </Button>
      </form>

      {/* Custom message */}
      <form
        action={(fd) => wrap(() => sendApplicantMessage(fd), "Message sent")}
        className="space-y-2 rounded-xl border border-border p-4"
      >
        <input type="hidden" name="id" value={applicationId} />
        <Label htmlFor="msg" className="flex items-center gap-1.5">
          <Send className="size-4" /> Send custom message
        </Label>
        <Input name="subject" placeholder="Subject (optional)" />
        <Textarea id="msg" name="body" rows={2} placeholder="Write a message to the applicant..." required />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Send message
        </Button>
      </form>
    </div>
  );
}
