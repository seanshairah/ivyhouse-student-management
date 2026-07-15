import { Plus, Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { ServiceBoard } from "@/components/owner/service-board";
import {
  CaretakerForm,
  CaretakerUpdateComposer,
  type CaretakerData,
} from "@/components/owner/caretaker-form";
import type { ServiceRow } from "@/components/owner/service-request-row";

export default async function OwnerServicesPage() {
  await requireRole("OWNER");

  const [requests, caretakers, houses] = await Promise.all([
    prisma.serviceRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: { house: true, caretaker: true },
    }),
    prisma.caretaker.findMany({
      orderBy: { name: "asc" },
      include: { house: true },
    }),
    prisma.house.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const requestRows: ServiceRow[] = requests.map((r) => ({
    id: r.id,
    reference: r.reference,
    title: r.title,
    status: r.status,
    priority: r.priority,
    houseName: r.house?.name ?? "—",
    caretakerId: r.caretakerId,
    caretakerName: r.caretaker?.name ?? null,
    resolutionNotes: r.resolutionNotes,
    createdAt: r.createdAt.toISOString(),
  }));

  const caretakerOptions = caretakers.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services & caretakers"
        description="Manage maintenance requests and your caretaker team."
      />

      <ServiceBoard
        requests={requestRows}
        houses={houses}
        caretakers={caretakerOptions}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Caretakers</CardTitle>
            <CaretakerForm
              houses={houses}
              trigger={
                <Button size="sm" variant="outline">
                  <Plus className="size-4" /> Add caretaker
                </Button>
              }
            />
          </CardHeader>
          <CardContent>
            {caretakers.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {caretakers.map((c) => (
                  <div key={c.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.role}</p>
                      </div>
                      <CaretakerForm
                        houses={houses}
                        caretaker={{
                          id: c.id,
                          name: c.name,
                          phone: c.phone,
                          email: c.email,
                          role: c.role,
                          houseId: c.houseId,
                          notes: c.notes,
                        } as CaretakerData}
                        trigger={
                          <Button variant="outline" size="icon" title="Edit">
                            <Pencil className="size-4" />
                          </Button>
                        }
                      />
                    </div>
                    <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                      <p>{c.phone}</p>
                      <p className="truncate">{c.email}</p>
                    </div>
                    {c.house && (
                      <Badge color="brand" className="mt-2">{c.house.name}</Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No caretakers" description="Add a caretaker to get started." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Send update to caretakers</CardTitle>
          </CardHeader>
          <CardContent>
            <CaretakerUpdateComposer />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
