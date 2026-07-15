"use client";

import { useState, useTransition } from "react";
import { Mail, Move, Archive, RefreshCw, Phone } from "lucide-react";
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
import { GenerateInvoiceDialog } from "./generate-invoice-dialog";
import {
  contactStudent,
  moveStudentRoom,
  archiveStudent,
  changeStudentStatus,
} from "@/app/owner/actions";
import { STUDENT_STATUS_META } from "@/constants";

interface RoomOption {
  id: string;
  label: string;
}

const STATUSES = Object.keys(STUDENT_STATUS_META);

export function StudentActions({
  studentProfileId,
  currentStatus,
  hasNextOfKin,
  availableRooms,
}: {
  studentProfileId: string;
  currentStatus: string;
  hasNextOfKin: boolean;
  availableRooms: RoomOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [contactOpen, setContactOpen] = useState(false);
  const [nokOpen, setNokOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  function wrap(
    fn: () => Promise<{ success: boolean; error?: string }>,
    ok: string,
    close?: () => void,
  ) {
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
    <div className="space-y-2">
      {/* Contact student */}
      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start">
            <Mail className="size-4" /> Contact student
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact student</DialogTitle>
            <DialogDescription>
              Choose how to reach this student — email, SMS, or both.
            </DialogDescription>
          </DialogHeader>
          <form
            action={(fd) => wrap(() => contactStudent(fd), "Message sent", () => setContactOpen(false))}
            className="space-y-4"
          >
            <input type="hidden" name="studentProfileId" value={studentProfileId} />
            <input type="hidden" name="target" value="student" />
            <div className="space-y-1.5">
              <Label htmlFor="channels">Send via</Label>
              <Select id="channels" name="channels" defaultValue="EMAIL,SMS">
                <option value="EMAIL,SMS">Email &amp; SMS</option>
                <option value="EMAIL">Email only</option>
                <option value="SMS">SMS only</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject (email)</Label>
              <Input id="subject" name="subject" placeholder="Subject" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body">Message</Label>
              <Textarea id="body" name="body" rows={4} required />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>{pending ? "Sending..." : "Send"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Contact next of kin */}
      <Dialog open={nokOpen} onOpenChange={setNokOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start" disabled={!hasNextOfKin}>
            <Phone className="size-4" /> Contact next of kin
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact next of kin</DialogTitle>
            <DialogDescription>Sends an SMS to the next of kin.</DialogDescription>
          </DialogHeader>
          <form
            action={(fd) => wrap(() => contactStudent(fd), "Message sent", () => setNokOpen(false))}
            className="space-y-4"
          >
            <input type="hidden" name="studentProfileId" value={studentProfileId} />
            <input type="hidden" name="target" value="nextOfKin" />
            <input type="hidden" name="channels" value="SMS" />
            <div className="space-y-1.5">
              <Label htmlFor="nok-body">Message</Label>
              <Textarea id="nok-body" name="body" rows={4} required />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>{pending ? "Sending..." : "Send"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generate invoice */}
      <GenerateInvoiceDialog studentProfileId={studentProfileId} />

      {/* Move room */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start">
            <Move className="size-4" /> Move room
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move student</DialogTitle>
            <DialogDescription>Reassign to an available room.</DialogDescription>
          </DialogHeader>
          <form
            action={(fd) => wrap(() => moveStudentRoom(fd), "Student moved", () => setMoveOpen(false))}
            className="space-y-4"
          >
            <input type="hidden" name="studentProfileId" value={studentProfileId} />
            <div className="space-y-1.5">
              <Label htmlFor="roomId">Room</Label>
              <Select id="roomId" name="roomId" required defaultValue="">
                <option value="" disabled>Select a room</option>
                {availableRooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </Select>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>{pending ? "Moving..." : "Move"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change status */}
      <form
        action={(fd) => wrap(() => changeStudentStatus(fd), "Status updated")}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="studentProfileId" value={studentProfileId} />
        <Select name="status" defaultValue={currentStatus} className="w-auto flex-1">
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STUDENT_STATUS_META[s].label}</option>
          ))}
        </Select>
        <Button type="submit" variant="outline" size="icon" disabled={pending} title="Update status">
          <RefreshCw className="size-4" />
        </Button>
      </form>

      {/* Archive */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700">
            <Archive className="size-4" /> Archive student
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive student?</DialogTitle>
            <DialogDescription>
              This sets the student to archived. You can change the status again later.
            </DialogDescription>
          </DialogHeader>
          <form
            action={(fd) => wrap(() => archiveStudent(fd), "Student archived", () => setArchiveOpen(false))}
          >
            <input type="hidden" name="studentProfileId" value={studentProfileId} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Archiving..." : "Archive"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
