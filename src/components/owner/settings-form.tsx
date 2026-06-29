"use client";

import { useTransition } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateSettings } from "@/app/owner/actions";

export interface SettingsData {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  currency: string;
  invoicePrefix: string;
  receiptPrefix: string;
  statementPrefix: string;
  paymentTermsDays: number;
  defaultMessage: string | null;
}

export function SettingsForm({ settings }: { settings: SettingsData }) {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await updateSettings(formData);
      if (res.success) toast.success("Settings saved");
      else toast.error(res.error ?? "Failed");
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="businessName">Business name</Label>
          <Input id="businessName" name="businessName" defaultValue={settings.businessName} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ownerName">Owner name</Label>
          <Input id="ownerName" name="ownerName" defaultValue={settings.ownerName} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ownerEmail">Owner email</Label>
          <Input id="ownerEmail" name="ownerEmail" type="email" defaultValue={settings.ownerEmail} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ownerPhone">Owner phone</Label>
          <Input id="ownerPhone" name="ownerPhone" defaultValue={settings.ownerPhone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Input id="currency" name="currency" defaultValue={settings.currency} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paymentTermsDays">Payment terms (days)</Label>
          <Input id="paymentTermsDays" name="paymentTermsDays" type="number" min={0} defaultValue={settings.paymentTermsDays} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoicePrefix">Invoice prefix</Label>
          <Input id="invoicePrefix" name="invoicePrefix" defaultValue={settings.invoicePrefix} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receiptPrefix">Receipt prefix</Label>
          <Input id="receiptPrefix" name="receiptPrefix" defaultValue={settings.receiptPrefix} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="statementPrefix">Statement prefix</Label>
          <Input id="statementPrefix" name="statementPrefix" defaultValue={settings.statementPrefix} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="defaultMessage">Default message</Label>
        <Textarea id="defaultMessage" name="defaultMessage" rows={2} defaultValue={settings.defaultMessage ?? ""} />
      </div>
      <Button type="submit" disabled={pending}>
        <Save className="size-4" /> {pending ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}
