"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { messageOwnerAction } from "@/app/student/actions";

export function MessageOwnerForm() {
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) =>
        start(async () => {
          const res = await messageOwnerAction(formData);
          if (res.success) {
            toast.success("Message sent to the owner");
            formRef.current?.reset();
          } else {
            toast.error(res.error ?? "Could not send message");
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
        <Label htmlFor="body">Message</Label>
        <Textarea
          id="body"
          name="body"
          placeholder="Write your message to the house owner…"
          required
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          Send message
        </Button>
      </div>
    </form>
  );
}
