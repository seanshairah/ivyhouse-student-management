"use client";

import { useState, useTransition } from "react";
import { FilePlus2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { createStudentInvoice } from "@/app/owner/actions";

export function GenerateInvoiceDialog({ studentProfileId }: { studentProfileId: string }) {
  const [open, setOpen] = useState(false);
  const [generateLink, setGenerateLink] = useState(true);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    if (generateLink) formData.set("generateLink", "on");
    startTransition(async () => {
      const res = await createStudentInvoice(formData);
      if (res.success) {
        toast.success("Invoice created");
        setOpen(false);
      } else {
        toast.error(res.error ?? "Could not create invoice");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start">
          <FilePlus2 className="size-4" /> Generate invoice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate invoice</DialogTitle>
          <DialogDescription>Create a new invoice for this student.</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="studentProfileId" value={studentProfileId} />
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" placeholder="e.g. Accommodation — March" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" name="amount" type="number" min={0} step="0.01" required />
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox checked={generateLink} onCheckedChange={(v) => setGenerateLink(Boolean(v))} />
            Also generate a payment link and notify the student
          </label>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
