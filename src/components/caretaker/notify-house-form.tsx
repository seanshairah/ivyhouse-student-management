"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { caretakerNotifyHouse } from "@/app/caretaker/notify/actions";

export function NotifyHouseForm({ studentCount }: { studentCount: number }) {
  const [pending, startTransition] = useTransition();
  const [bodyLen, setBodyLen] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(fd: FormData) {
    startTransition(async () => {
      const res = await caretakerNotifyHouse(fd);
      if (res.success) {
        toast.success(res.message ?? "Sent.");
        formRef.current?.reset();
        setBodyLen(0);
      } else {
        toast.error(res.error ?? "Could not send.");
      }
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">New announcement</CardTitle>
        <CardDescription>
          Goes to {studentCount} current student{studentCount === 1 ? "" : "s"}.
          Keep SMS under 160 characters so it arrives as one message.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nh-subject">Subject (email only)</Label>
            <Input
              id="nh-subject"
              name="subject"
              placeholder="A notice from your caretaker"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nh-body">Message</Label>
            <Textarea
              id="nh-body"
              name="body"
              rows={5}
              required
              onChange={(e) => setBodyLen(e.target.value.length)}
            />
            <p className="text-xs text-muted-foreground">
              {bodyLen} characters{bodyLen > 160 ? " — will span multiple SMS" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="viaEmail" defaultChecked /> Email
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="viaSms" defaultChecked /> SMS
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="onlyOwing" /> Only students who still owe money
            </label>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            Send to {studentCount}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
