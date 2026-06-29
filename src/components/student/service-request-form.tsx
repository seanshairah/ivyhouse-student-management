"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitServiceRequestAction } from "@/app/student/actions";

const CATEGORIES = [
  "MAINTENANCE",
  "CLEANING",
  "UTILITY",
  "SECURITY",
  "REPAIR",
  "OTHER",
] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const titleCase = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase();

export function ServiceRequestForm({ houseId }: { houseId?: string | null }) {
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) =>
        start(async () => {
          const res = await submitServiceRequestAction(formData);
          if (res.success) {
            toast.success("Request submitted");
            formRef.current?.reset();
          } else {
            toast.error(res.error ?? "Could not submit request");
          }
        })
      }
      className="space-y-4"
    >
      <input type="hidden" name="houseId" value={houseId ?? ""} />

      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" placeholder="e.g. Leaking tap in bathroom" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Select id="category" name="category" defaultValue="MAINTENANCE">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority</Label>
          <Select id="priority" name="priority" defaultValue="MEDIUM">
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {titleCase(p)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="Describe the issue and where it is…"
          required
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Wrench />}
          Submit request
        </Button>
      </div>
    </form>
  );
}
