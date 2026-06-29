"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction } from "@/app/student/actions";

interface ProfileFormProps {
  defaults: {
    phone: string;
    email: string;
    nextOfKinName: string;
    nextOfKinPhone: string;
    nextOfKinRelation: string;
    guardianName: string;
    guardianPhone: string;
  };
}

/** Editable contact + next-of-kin info form. */
export function ProfileForm({ defaults }: ProfileFormProps) {
  const [pending, start] = useTransition();

  return (
    <form
      action={(formData) =>
        start(async () => {
          const res = await updateProfileAction(formData);
          if (res.success) toast.success("Profile updated");
          else toast.error(res.error ?? "Could not update profile");
        })
      }
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" name="phone" defaultValue={defaults.phone} required />
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={defaults.email}
          required
        />
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold">Next of kin</p>
        <p className="text-xs text-muted-foreground">
          Who should we contact in an emergency?
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" name="nextOfKinName" defaultValue={defaults.nextOfKinName} />
        <Field label="Phone" name="nextOfKinPhone" defaultValue={defaults.nextOfKinPhone} />
        <Field
          label="Relationship"
          name="nextOfKinRelation"
          defaultValue={defaults.nextOfKinRelation}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Guardian name" name="guardianName" defaultValue={defaults.guardianName} />
        <Field label="Guardian phone" name="guardianPhone" defaultValue={defaults.guardianPhone} />
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          Save changes
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
      />
    </div>
  );
}
