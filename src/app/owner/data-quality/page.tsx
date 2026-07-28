import Link from "next/link";
import { AlertTriangle, CheckCircle2, DoorOpen } from "lucide-react";
import { requireRole } from "@/lib/session";
import { getDataQualityReport } from "@/core/billing/data-quality";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export const metadata = { title: "Needs attention" };

const SEVERITY: Record<string, string> = {
  high: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100",
  medium:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100",
  low: "border-border bg-muted/40 text-foreground",
};

/**
 * One place that answers "what in my data is quietly broken?".
 *
 * Every item here is something that stops a student being billed, contacted or
 * housed without raising an error anywhere — the sort of thing that otherwise
 * only surfaces at the end of a term.
 */
export default async function DataQualityPage() {
  await requireRole("OWNER");
  const report = await getDataQualityReport();
  const allClear = report.issues.length === 0 && report.rooms.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Needs attention"
        description="Students and rooms with missing or contradictory information"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Students on file"
          value={report.totalStudents}
          icon="Users"
          accent="blue"
        />
        <StatCard
          label="Need attention"
          value={report.studentsNeedingAttention}
          icon="AlertTriangle"
          accent={report.studentsNeedingAttention > 0 ? "amber" : "emerald"}
          hint={
            report.totalStudents > 0
              ? `${Math.round((report.studentsNeedingAttention / report.totalStudents) * 100)}% of students`
              : undefined
          }
        />
        <StatCard
          label="Room problems"
          value={report.rooms.length}
          icon="DoorOpen"
          accent={report.rooms.length > 0 ? "rose" : "emerald"}
        />
      </div>

      {allClear ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={<CheckCircle2 className="size-5" />}
              title="Everything looks in order"
              description="No missing contact details, unallocated students or room inconsistencies."
            />
          </CardContent>
        </Card>
      ) : null}

      {report.issues.map((group) => (
        <Card key={group.key}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle
                    className={
                      group.severity === "high"
                        ? "size-4 text-rose-600"
                        : group.severity === "medium"
                          ? "size-4 text-amber-600"
                          : "size-4 text-muted-foreground"
                    }
                    aria-hidden="true"
                  />
                  {group.title}
                </CardTitle>
                <CardDescription>{group.consequence}</CardDescription>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-sm font-semibold ${SEVERITY[group.severity]}`}
              >
                {group.count}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {group.students.slice(0, 25).map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.fullName}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {s.email}
                      {s.house ? ` · ${s.house}` : ""}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/owner/students/${s.id}`}>Open</Link>
                  </Button>
                </li>
              ))}
            </ul>
            {group.count > 25 ? (
              <p className="pt-3 text-sm text-muted-foreground">
                Showing 25 of {group.count}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}

      {report.rooms.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DoorOpen className="size-4 text-rose-600" aria-hidden="true" />
              Room problems
            </CardTitle>
            <CardDescription>
              Duplicate numbers, occupancy that disagrees with the students
              actually assigned, and rooms with no rent price set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {report.rooms.map((r, i) => (
                <li key={`${r.id}-${i}`} className="py-2.5">
                  <p className="font-medium">
                    Room {r.number}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {r.house}
                    </span>
                  </p>
                  <p className="text-sm text-rose-600">{r.problem}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
