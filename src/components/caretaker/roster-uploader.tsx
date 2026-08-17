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

export function RosterUploader({ houseName }: { houseName: string }) {
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [confirm, setConfirm] = useState("");

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
            is added up per student. Email and Phone columns are picked up when
            present. Nothing is changed at this step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={onPreview} className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Upload />}
              Check sheet
            </Button>
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
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Students" value={String(preview.students)} />
              <Stat label="Rooms" value={String(preview.roomsOnSheet)} />
              <Stat label="Match existing" value={String(preview.matchesExisting)} />
              <Stat label="New accounts" value={String(preview.newAccounts)} />
            </div>
            <p className="text-sm text-muted-foreground">
              Total credited on the sheet:{" "}
              <span className="font-semibold text-foreground">
                {formatCurrency(preview.totalCredited ?? 0)}
              </span>
            </p>

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
                disabled={pending || confirm.trim().toUpperCase() !== "IMPORT"}
              >
                {pending ? <Loader2 className="animate-spin" /> : <Upload />}
                Import into {houseName}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Safe to click again with the same file — a run that hits the time
              limit continues where it stopped, and a finished import changes
              nothing.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-bold">{value}</p>
    </div>
  );
}
