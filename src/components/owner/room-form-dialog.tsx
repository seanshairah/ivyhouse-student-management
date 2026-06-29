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
import { createRoom, updateRoom } from "@/app/owner/actions";

const ROOM_TYPES = ["SINGLE", "SHARED_DOUBLE", "SHARED_TRIPLE", "ENSUITE", "STUDIO"];
const ROOM_STATUSES = [
  "AVAILABLE",
  "PENDING_APPLICATION",
  "RESERVED",
  "OCCUPIED",
  "MAINTENANCE",
  "UNAVAILABLE",
];

export interface RoomFormData {
  id?: string;
  houseId: string;
  number: string;
  name: string | null;
  type: string;
  capacity: number;
  price: number;
  status: string;
  floor: string | null;
  description: string | null;
  images?: string[];
}

export function RoomFormDialog({
  houses,
  room,
  trigger,
}: {
  houses: { id: string; name: string }[];
  room?: RoomFormData;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(room?.id);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = isEdit ? await updateRoom(formData) : await createRoom(formData);
      if (res.success) {
        toast.success(isEdit ? "Room updated" : "Room added");
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
          <DialogTitle>{isEdit ? "Edit room" : "Add room"}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={room!.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="houseId">House</Label>
              <Select id="houseId" name="houseId" defaultValue={room?.houseId ?? houses[0]?.id}>
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="number">Room number</Label>
              <Input id="number" name="number" defaultValue={room?.number ?? ""} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name (optional)</Label>
              <Input id="name" name="name" defaultValue={room?.name ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Select id="type" name="type" defaultValue={room?.type ?? "SINGLE"}>
                {ROOM_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="capacity">Capacity</Label>
              <Input id="capacity" name="capacity" type="number" min={1} max={10} defaultValue={room?.capacity ?? 1} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price">Price</Label>
              <Input id="price" name="price" type="number" min={0} step="0.01" defaultValue={room?.price ?? 0} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={room?.status ?? "AVAILABLE"}>
                {ROOM_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="floor">Floor (optional)</Label>
              <Input id="floor" name="floor" defaultValue={room?.floor ?? ""} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" name="description" rows={2} defaultValue={room?.description ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="images">Room photos (optional)</Label>
            <Textarea
              id="images"
              name="images"
              rows={3}
              placeholder="One image URL per line"
              defaultValue={room?.images?.join("\n") ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              One image URL per line — shown in the room gallery.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : isEdit ? "Save changes" : "Add room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
