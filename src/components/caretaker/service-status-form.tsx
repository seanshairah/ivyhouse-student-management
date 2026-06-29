"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateTaskStatusAction } from "@/app/caretaker/actions";

const STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
] as const;

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

interface ServiceStatusFormProps {
  id: string;
  currentStatus: string;
  currentNotes?: string | null;
}

export function ServiceStatusForm({
  id,
  currentStatus,
  currentNotes,
}: ServiceStatusFormProps) {
  const [status, setStatus] = useState(currentStatus);
  const [notes, setNotes] = useState(currentNotes ?? "");
  const [pending, start] = useTransition();

  const dirty = status !== currentStatus || notes !== (currentNotes ?? "");

  const save = () =>
    start(async () => {
      const res = await updateTaskStatusAction(id, status, notes);
      if (res.success) toast.success("Request updated");
      else toast.error(res.error ?? "Could not update request");
    });

  return (
    <div className="space-y-2.5">
      <Select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="h-9 text-sm"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </Select>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add resolution notes…"
        className="min-h-[64px] text-sm"
      />
      <Button
        size="sm"
        variant="brand"
        className="w-full"
        disabled={pending || !dirty}
        onClick={save}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check />}
        Update
      </Button>
    </div>
  );
}
