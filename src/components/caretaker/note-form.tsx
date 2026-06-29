"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { noteToOwnerAction } from "@/app/caretaker/actions";

export function NoteForm() {
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) =>
        start(async () => {
          const res = await noteToOwnerAction(formData);
          if (res.success) {
            toast.success("Note sent to the owner");
            formRef.current?.reset();
          } else {
            toast.error(res.error ?? "Could not send note");
          }
        })
      }
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" placeholder="What is this about?" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="body">Note</Label>
        <Textarea
          id="body"
          name="body"
          placeholder="Write your note to the owner…"
          required
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          Send note
        </Button>
      </div>
    </form>
  );
}
