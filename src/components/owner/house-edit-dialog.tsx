"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
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
import { updateHouse } from "@/app/owner/actions";

export interface HouseEditData {
  id: string;
  tagline: string | null;
  description: string;
  location: string;
  imageUrl: string | null;
  images: string[];
  amenities: string[];
  services: string[];
  rules: string[];
  safetyInfo: string[];
}

export function HouseEditDialog({ house }: { house: HouseEditData }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await updateHouse(formData);
      if (res.success) {
        toast.success("House details updated");
        setOpen(false);
      } else {
        toast.error(res.error ?? "Could not update house");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" /> Edit details
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {house.location ? "house" : ""} details</DialogTitle>
          <DialogDescription>
            Separate list items with commas or new lines.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="id" value={house.id} />
          <div className="space-y-1.5">
            <Label htmlFor="tagline">Tagline</Label>
            <Input id="tagline" name="tagline" defaultValue={house.tagline ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" name="location" defaultValue={house.location} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={3} defaultValue={house.description} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imageUrl">Cover image URL</Label>
            <Input
              id="imageUrl"
              name="imageUrl"
              placeholder="https://…"
              defaultValue={house.imageUrl ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="images">Gallery images</Label>
            <Textarea
              id="images"
              name="images"
              rows={4}
              placeholder="One image URL per line"
              defaultValue={house.images.join("\n")}
            />
            <p className="text-xs text-muted-foreground">
              One image URL per line. These appear in the public house gallery.
              The first image is used as the cover if none is set above.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="amenities">Amenities</Label>
              <Textarea id="amenities" name="amenities" rows={2} defaultValue={house.amenities.join(", ")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="services">Services</Label>
              <Textarea id="services" name="services" rows={2} defaultValue={house.services.join(", ")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rules">Rules</Label>
              <Textarea id="rules" name="rules" rows={2} defaultValue={house.rules.join(", ")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="safetyInfo">Safety info</Label>
              <Textarea id="safetyInfo" name="safetyInfo" rows={2} defaultValue={house.safetyInfo.join(", ")} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
