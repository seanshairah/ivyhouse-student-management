"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check, BedDouble, AlertCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { completeOnboardingAction } from "@/app/student/actions";

export interface RoomOption {
  id: string;
  number: string;
  name: string | null;
  type: string;
  floor: string | null;
  houseName: string;
  price: number;
  remaining: number;
  isCurrent: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  SINGLE: "Single",
  SHARED_DOUBLE: "Shared · Double",
  SHARED_TRIPLE: "Shared · Triple",
  ENSUITE: "En-suite",
  STUDIO: "Studio",
};

interface Defaults {
  roomId: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  nextOfKinRelation: string;
  guardianName: string;
  guardianPhone: string;
}

export function OnboardingForm({
  rooms,
  defaults,
}: {
  rooms: RoomOption[];
  defaults: Defaults;
}) {
  const router = useRouter();
  const [roomId, setRoomId] = React.useState(defaults.roomId);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("roomId", roomId);
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
            <BedDouble className="size-4 text-brand-600" /> Choose your room
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rooms.length === 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                No rooms are available to select right now. Please contact the
                Ivy House office and they&apos;ll assign your room.
              </span>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {rooms.map((r) => {
                const selected = roomId === r.id;
                return (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => setRoomId(r.id)}
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
                    <span className="font-display text-base font-bold">{r.number}</span>
                    <span className="text-xs text-muted-foreground">
                      {TYPE_LABELS[r.type] ?? r.type}
                      {r.floor ? ` · ${r.floor} floor` : ""}
                    </span>
                    <span className="mt-2 font-semibold">
                      {formatCurrency(r.price)}
                      <span className="text-xs font-normal text-muted-foreground">/mo</span>
                    </span>
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3" />
                      {r.isCurrent
                        ? "Your current room"
                        : `${r.remaining} space${r.remaining === 1 ? "" : "s"} left`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
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

      <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending || rooms.length === 0}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Finish onboarding
      </Button>
    </form>
  );
}
