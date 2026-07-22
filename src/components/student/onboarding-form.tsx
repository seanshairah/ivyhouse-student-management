"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check, BedDouble, AlertCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { completeOnboardingAction } from "@/app/student/actions";

const ROOM_TYPES: { value: string; label: string; sub: string; price: string }[] = [
  { value: "SINGLE", label: "Single", sub: "Private room, 1 person", price: "" },
  { value: "SHARED_DOUBLE", label: "2-bed sharing", sub: "Shared by 2", price: "$120/mo" },
  { value: "SHARED_TRIPLE", label: "3-bed sharing", sub: "Shared by 3", price: "$90/mo" },
];

interface Defaults {
  nextOfKinName: string;
  nextOfKinPhone: string;
  nextOfKinRelation: string;
  guardianName: string;
  guardianPhone: string;
}

export function OnboardingForm({ defaults }: { defaults: Defaults }) {
  const router = useRouter();
  const [roomType, setRoomType] = React.useState("");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("roomType", roomType);
    start(async () => {
      const res = await completeOnboardingAction(formData);
      if (res.success) {
        toast.success("You're all set — welcome to Ivy House!");
        router.push("/student");
        router.refresh();
      } else {
        setError(res.error ?? "Something went wrong. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1 — room */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BedDouble className="size-4 text-brand-600" /> Your room
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="roomNumber">Room number</Label>
            <Input
              id="roomNumber"
              name="roomNumber"
              placeholder="e.g. 204"
              autoComplete="off"
              required
            />
            <p className="text-xs text-muted-foreground">
              Enter the room you&apos;ve been given. If you&apos;re sharing, everyone in
              the room enters the same number.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Room type</Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {ROOM_TYPES.map((t) => {
                const selected = roomType === t.value;
                return (
                  <button
                    type="button"
                    key={t.value}
                    onClick={() => setRoomType(t.value)}
                    aria-pressed={selected}
                    className={`relative flex flex-col rounded-xl border p-4 text-left transition-colors ${
                      selected
                        ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500"
                        : "border-border bg-background hover:border-brand-300 hover:bg-accent"
                    }`}
                  >
                    {selected && (
                      <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-brand-600 text-white">
                        <Check className="size-3.5" />
                      </span>
                    )}
                    <span className="font-semibold">{t.label}</span>
                    <span className="text-xs text-muted-foreground">{t.sub}</span>
                    {t.price && (
                      <span className="mt-2 text-sm font-semibold text-brand-700">{t.price}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — next of kin */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-brand-600" /> Next of kin
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nextOfKinName">Full name</Label>
              <Input id="nextOfKinName" name="nextOfKinName" defaultValue={defaults.nextOfKinName} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nextOfKinRelation">Relationship</Label>
              <Input id="nextOfKinRelation" name="nextOfKinRelation" placeholder="e.g. Parent, Sibling" defaultValue={defaults.nextOfKinRelation} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nextOfKinPhone">Phone number</Label>
              <Input id="nextOfKinPhone" name="nextOfKinPhone" inputMode="tel" placeholder="0771234567" defaultValue={defaults.nextOfKinPhone} required />
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-border p-4">
            <p className="mb-3 text-sm font-medium">Guardian (optional)</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="guardianName">Guardian name</Label>
                <Input id="guardianName" name="guardianName" defaultValue={defaults.guardianName} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guardianPhone">Guardian phone</Label>
                <Input id="guardianPhone" name="guardianPhone" inputMode="tel" defaultValue={defaults.guardianPhone} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Finish onboarding
      </Button>
    </form>
  );
}
