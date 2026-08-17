"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import {
  previewRosterUpload,
  applyRosterUpload,
  type RosterPreview,
} from "@/app/caretaker/import/actions";

export function RosterUploader({
  houseName,
  defaultPriceTwoShare,
  defaultPriceThreeShare,
}: {
  houseName: string;
  defaultPriceTwoShare: number;
  defaultPriceThreeShare: number;
}) {
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [confirm, setConfirm] = useState("");
  const [price2, setPrice2] = useState(String(defaultPriceTwoShare));
  const [price3, setPrice3] = useState(String(defaultPriceThreeShare));

  function onPreview(fd: FormData) {
    startTransition(async () => {
      const res = await previewRosterUpload(fd);
      if (res.ok) {
        setPreview(res);
        setConfirm("");
      } else {
        toast.error(res.error ?? "Could not read that file.");
      }
    });
  }

  function onApply(fd: FormData) {
    startTransition(async () => {
      const res = await applyRosterUpload(fd);
      if (res.ok) {
        toast.success(res.message ?? "Imported.");
        if (res.summary?.done) setPreview(null);
      } else {
        toast.error(res.error ?? "Import failed.");
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="size-5" /> 1 · Upload &amp; check the sheet
          </CardTitle>
          <CardDescription>
            An .xlsx with Room and Full Name columns; every other money column
            is added up per student. A line with a room but no name counts as
            an empty bed — that&apos;s how 3-sharing rooms and vacancies are
            recognised. Email and Phone columns are picked up when present.
            Nothing is changed at this step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={onPreview} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="roster-file">Roster file</Label>
                <Input
                  id="roster-file"
                  name="file"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                  className="sm:w-80"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price-2">Monthly rent — 2-sharing</Label>
                <Input
                  id="price-2"
                  name="monthlyPrice2"
                  type="number"
                  min="20"
                  max="500"
                  value={price2}
                  onChange={(e) => setPrice2(e.target.value)}
                  className="sm:w-36"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price-3">3-sharing</Label>
                <Input
                  id="price-3"
                  name="monthlyPrice3"
                  type="number"
                  min="20"
                  max="500"
                  value={price3}
                  onChange={(e) => setPrice3(e.target.value)}
                  className="sm:w-28"
                />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Upload />}
                Check sheet
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Per student, per month, including any booking amount that counts
              toward the month. Balances are judged against these.
            </p>
          </form>
        </CardContent>
      </Card>

      {preview?.ok && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-5 text-emerald-600" /> 2 · What this
              import will do to {preview.houseName}
            </CardTitle>
            <CardDescription>
              Money columns read: {preview.moneyColumns?.join(", ") || "none"}.
              {" "}Rooms: {preview.roomsTwoShare} two-sharing
              {preview.roomsThreeShare ? ` + ${preview.roomsThreeShare} three-sharing` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.needsThreeSharePrice && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  This sheet has 3-sharing rooms but no 3-sharing rent was set —
                  fill it in above and check the sheet again.
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Students" value={String(preview.students)} />
              <Stat label="Match existing" value={String(preview.matchesExisting)} />
              <Stat label="New accounts" value={String(preview.newAccounts)} />
              <Stat label="Sheet total" value={formatCurrency(preview.totalCredited ?? 0)} />
            </div>
            {preview.classification && (
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Stat label="Paid in full" value={String(preview.classification.paidInFull)} tone="good" />
                <Stat label="Paid the month" value={String(preview.classification.paidOneMonth)} tone="good" />
                <Stat label="Part-paid" value={String(preview.classification.partiallyPaid)} tone="warn" />
                <Stat label="Not paid" value={String(preview.classification.notPaid)} tone="bad" />
              </div>
            )}

            {(preview.missingFromSheet?.length ?? 0) > 0 && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {preview.missingFromSheet!.length} current resident
                  {preview.missingFromSheet!.length === 1 ? " is" : "s are"} NOT
                  on this sheet and will lose their room (accounts and payment
                  history are kept):{" "}
                  {preview.missingFromSheet!.slice(0, 6).join(", ")}
                  {preview.missingFromSheet!.length > 6 ? "…" : ""}
                </span>
              </div>
            )}

            {(preview.warnings?.length ?? 0) > 0 && (
              <div className="space-y-1 rounded-xl border border-border p-3 text-xs text-muted-foreground">
                {preview.warnings!.map((w, i) => (
                  <p key={i}>⚠ {w}</p>
                ))}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Credited</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows!.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.room}</TableCell>
                      <TableCell>{r.fullName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(r.credited)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {preview.students! > preview.rows!.length && (
                <p className="border-t border-border p-2 text-center text-xs text-muted-foreground">
                  …and {preview.students! - preview.rows!.length} more
                </p>
              )}
            </div>

            <form action={onApply} className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
              <input type="hidden" name="rowsJson" value={preview.rowsJson ?? ""} />
              <input type="hidden" name="bedsJson" value={preview.bedsJson ?? ""} />
              <input type="hidden" name="monthlyPrice2" value={price2} />
              <input type="hidden" name="monthlyPrice3" value={price3} />
              <div className="space-y-1.5">
                <Label htmlFor="roster-confirm">Type IMPORT to confirm</Label>
                <Input
                  id="roster-confirm"
                  name="confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="IMPORT"
                  className="sm:w-40"
                />
              </div>
              <Button
                type="submit"
                variant="brand"
                disabled={
                  pending ||
                  preview.needsThreeSharePrice ||
                  confirm.trim().toUpperCase() !== "IMPORT"
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <Upload />}
                Import into {houseName}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Safe to click again with the same file — a run that hits the time
              limit continues where it stopped, and a finished import changes
              nothing. Changing the sheet or the prices rebuilds exactly what
              changed.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-rose-700"
          : "";
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-display text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
