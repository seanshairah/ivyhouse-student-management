"use client";

import { useState, useTransition, type ReactNode } from "react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { upsertCaretaker } from "@/app/owner/actions";

export interface CaretakerData {
  id?: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  houseId: string | null;
  notes: string | null;
}

export function CaretakerForm({
  houses,
  caretaker,
  trigger,
}: {
  houses: { id: string; name: string }[];
  caretaker?: CaretakerData;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(caretaker?.id);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await upsertCaretaker(formData);
      if (res.success) {
        toast.success(isEdit ? "Caretaker updated" : "Caretaker added");
        setOpen(false);
      } else {
        toast.error(res.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit caretaker" : "Add caretaker"}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={caretaker!.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={caretaker?.name ?? ""} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <Input id="role" name="role" defaultValue={caretaker?.role ?? "Caretaker"} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={caretaker?.phone ?? ""} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={caretaker?.email ?? ""} required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="houseId">House</Label>
              <Select id="houseId" name="houseId" defaultValue={caretaker?.houseId ?? ""}>
                <option value="">Unassigned</option>
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={caretaker?.notes ?? ""} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : isEdit ? "Save changes" : "Add caretaker"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CaretakerUpdateComposer() {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await (await import("@/app/owner/actions")).sendCaretakerUpdate(formData);
      if (res.success) {
        toast.success("Update sent to caretakers");
        (document.getElementById("caretaker-update-form") as HTMLFormElement)?.reset();
      } else {
        toast.error(res.error ?? "Could not send update");
      }
    });
  }

  return (
    <form id="caretaker-update-form" action={onSubmit} className="space-y-3">
      <Input name="subject" placeholder="Subject" />
      <Textarea name="body" rows={3} placeholder="Message to all active caretakers..." required />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Sending..." : "Send update to caretakers"}
      </Button>
    </form>
  );
}
