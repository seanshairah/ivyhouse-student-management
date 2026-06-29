"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { sendOwnerMessage } from "@/app/owner/actions";

const GROUPS = [
  { value: "ALL_STUDENTS", label: "All students" },
  { value: "HOUSE", label: "Students in a house" },
  { value: "UNPAID", label: "Students with unpaid invoices" },
  { value: "APPROVED", label: "Approved applicants" },
  { value: "PAYMENT_PENDING", label: "Payment pending" },
  { value: "CARETAKERS", label: "Caretakers" },
];

export function MessageComposer({ houses }: { houses: { id: string; name: string }[] }) {
  const [group, setGroup] = useState("ALL_STUDENTS");
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const channels: string[] = [];
    if (email) channels.push("EMAIL");
    if (sms) channels.push("SMS");
    formData.set("channels", channels.join(","));
    if (!channels.length) {
      toast.error("Choose at least one channel");
      return;
    }
    startTransition(async () => {
      const res = await sendOwnerMessage(formData);
      if (res.success) {
        toast.success(res.error ?? "Message sent");
        (document.getElementById("composer-form") as HTMLFormElement)?.reset();
      } else {
        toast.error(res.error ?? "Could not send message");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compose message</CardTitle>
      </CardHeader>
      <CardContent>
        <form id="composer-form" action={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="group">Recipient group</Label>
              <Select id="group" name="group" value={group} onChange={(e) => setGroup(e.target.value)}>
                {GROUPS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </Select>
            </div>
            {group === "HOUSE" && (
              <div className="space-y-1.5">
                <Label htmlFor="houseId">House</Label>
                <Select id="houseId" name="houseId" defaultValue={houses[0]?.id}>
                  {houses.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Channels</Label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={email} onCheckedChange={(v) => setEmail(Boolean(v))} /> Email
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={sms} onCheckedChange={(v) => setSms(Boolean(v))} /> SMS
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" name="subject" placeholder="Subject (used for email)" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body">Message</Label>
            <Textarea id="body" name="body" rows={5} placeholder="Write your message..." required />
          </div>
          <Button type="submit" disabled={pending}>
            <Send className="size-4" /> {pending ? "Sending..." : "Send message"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
