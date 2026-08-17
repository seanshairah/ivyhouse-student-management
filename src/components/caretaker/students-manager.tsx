"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Search,
  Banknote,
  UserPlus,
  UserMinus,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { STUDENT_STATUS_META } from "@/constants";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/misc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  caretakerAddStudent,
  caretakerNotifyStudent,
  caretakerRecordPayment,
  caretakerRemoveStudent,
} from "@/app/caretaker/students/actions";

export interface CaretakerStudentRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  roomNumber: string | null;
  houseName: string;
  status: string;
  balance: number;
}

export interface RoomOption {
  id: string;
  number: string;
  free: number;
}

type DialogKind = "pay" | "notify" | "remove" | null;

export function CaretakerStudentsManager({
  students,
  rooms,
}: {
  students: CaretakerStudentRow[];
  rooms: RoomOption[];
}) {
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [target, setTarget] = useState<CaretakerStudentRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (s.roomNumber ?? "").toLowerCase() === q,
    );
  }, [students, query]);

  function run(action: (fd: FormData) => Promise<{ success: boolean; message?: string; error?: string }>, fd: FormData) {
    startTransition(async () => {
      const res = await action(fd);
      if (res.success) {
        toast.success(res.message ?? "Done.");
        setDialog(null);
        setAddOpen(false);
      } else {
        toast.error(res.error ?? "Something went wrong.");
      }
    });
  }

  function open(kind: DialogKind, student: CaretakerStudentRow) {
    setTarget(student);
    setDialog(kind);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, email or room…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus /> Add student
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No students found"
                description="Try a different search."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Owing</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.roomNumber ?? "—"}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{s.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.houseName}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{s.phone || "—"}</p>
                        <p className="text-xs text-muted-foreground">{s.email}</p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge meta={STUDENT_STATUS_META[s.status as keyof typeof STUDENT_STATUS_META]} />
                      </TableCell>
                      <TableCell className="text-right">
                        {s.balance > 0 ? (
                          <span className="font-semibold text-rose-600">
                            {formatCurrency(s.balance)}
                          </span>
                        ) : (
                          <span className="text-emerald-600">Paid up</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => open("pay", s)}
                            title="Record a cash payment"
                          >
                            <Banknote /> Record payment
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => open("notify", s)}
                            title="Send email / SMS"
                          >
                            <MessageSquare />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => open("remove", s)}
                            title="Move out / remove"
                          >
                            <UserMinus />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record payment */}
      <Dialog open={dialog === "pay"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <form action={(fd) => run(caretakerRecordPayment, fd)}>
            <DialogHeader>
              <DialogTitle>Record payment — {target?.fullName}</DialogTitle>
              <DialogDescription>
                Money handed to you in person. A receipt is issued and the
                student&apos;s balance updates immediately.
                {target && target.balance > 0 && (
                  <> Currently owing {formatCurrency(target.balance)}.</>
                )}
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="studentProfileId" value={target?.id ?? ""} />
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="ct-amount">Amount (USD)</Label>
                <Input
                  id="ct-amount"
                  name="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  placeholder="120.00"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ct-category">For</Label>
                  <Select id="ct-category" name="category" defaultValue="RENT">
                    <option value="RENT">Rent</option>
                    <option value="TRANSPORT">Transport</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ct-method">Paid by</Label>
                  <Select id="ct-method" name="method" defaultValue="CASH">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="MANUAL">EcoCash (direct)</option>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Record payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Notify */}
      <Dialog
        open={dialog === "notify"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <form action={(fd) => run(caretakerNotifyStudent, fd)}>
            <DialogHeader>
              <DialogTitle>Message {target?.fullName}</DialogTitle>
              <DialogDescription>
                Sends directly to this student — email, SMS, or both.
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="studentProfileId" value={target?.id ?? ""} />
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="ct-subject">Subject (email)</Label>
                <Input
                  id="ct-subject"
                  name="subject"
                  placeholder="Message from your caretaker"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-body">Message</Label>
                <Textarea id="ct-body" name="body" rows={4} required />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="viaEmail" defaultChecked /> Email
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="viaSms" defaultChecked /> SMS
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Send
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <Dialog
        open={dialog === "remove"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <form action={(fd) => run(caretakerRemoveStudent, fd)}>
            <DialogHeader>
              <DialogTitle>Remove {target?.fullName}?</DialogTitle>
              <DialogDescription>
                Marks them as moved out, frees their room and disables their
                login. Their payment history and receipts are kept — this
                cannot lose money records.
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="studentProfileId" value={target?.id ?? ""} />
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Move out &amp; remove
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add student */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <form action={(fd) => run(caretakerAddStudent, fd)}>
            <DialogHeader>
              <DialogTitle>Add a student</DialogTitle>
              <DialogDescription>
                Creates their account and (optionally) places them in a room and
                records a deposit already paid.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="ct-name">Full name</Label>
                <Input id="ct-name" name="fullName" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ct-email">Email</Label>
                  <Input id="ct-email" name="email" type="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ct-phone">Phone</Label>
                  <Input id="ct-phone" name="phone" placeholder="07…" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ct-room">Room</Label>
                  <Select id="ct-room" name="roomId" defaultValue="">
                    <option value="">No room yet</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.number} ({r.free} space{r.free === 1 ? "" : "s"})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ct-deposit">Deposit paid (optional)</Label>
                  <Input
                    id="ct-deposit"
                    name="deposit"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="30.00"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="sendCredentials" defaultChecked /> Send login
                details by email &amp; SMS now
              </label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Add student
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
