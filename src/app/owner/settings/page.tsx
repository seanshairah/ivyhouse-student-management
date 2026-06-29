import { CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getSettings } from "@/services/numbering";
import { emailProviderStatus } from "@/services/email";
import { smsProviderStatus } from "@/services/sms";
import { paynowProviderStatus } from "@/services/payments";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SettingsForm, type SettingsData } from "@/components/owner/settings-form";

function ProviderCard({
  name,
  configured,
  mode,
}: {
  name: string;
  configured: boolean;
  mode: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{name}</p>
        {configured ? (
          <CheckCircle2 className="size-5 text-emerald-600" />
        ) : (
          <XCircle className="size-5 text-amber-500" />
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{mode}</p>
    </Card>
  );
}

export default async function OwnerSettingsPage() {
  await requireRole("OWNER");

  const [settings, users] = await Promise.all([
    getSettings(),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const email = emailProviderStatus();
  const sms = smsProviderStatus();
  const paynow = paynowProviderStatus();

  const settingsData: SettingsData = {
    businessName: settings.businessName,
    ownerName: settings.ownerName,
    ownerEmail: settings.ownerEmail,
    ownerPhone: settings.ownerPhone,
    currency: settings.currency,
    invoicePrefix: settings.invoicePrefix,
    receiptPrefix: settings.receiptPrefix,
    statementPrefix: settings.statementPrefix,
    paymentTermsDays: settings.paymentTermsDays,
    defaultMessage: settings.defaultMessage,
  };

  const roleColor: Record<string, "brand" | "blue" | "slate"> = {
    OWNER: "brand",
    CARETAKER: "blue",
    STUDENT: "slate",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Business profile, document numbering and provider status."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Business profile</CardTitle>
            </CardHeader>
            <CardContent>
              <SettingsForm settings={settingsData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge color={roleColor[u.role] ?? "slate"}>{u.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge color={u.isActive ? "emerald" : "rose"}>
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Provider status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProviderCard name="Email" configured={email.resend || email.smtp} mode={email.mode} />
              <ProviderCard name="SMS" configured={sms.configured} mode={sms.mode} />
              <ProviderCard name="Paynow" configured={paynow.configured} mode={paynow.mode} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Document numbering</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Next invoice</span>
                <span className="font-mono">
                  {settings.invoicePrefix}-{String(settings.invoiceCounter + 1).padStart(5, "0")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Next receipt</span>
                <span className="font-mono">
                  {settings.receiptPrefix}-{String(settings.receiptCounter + 1).padStart(5, "0")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Next statement</span>
                <span className="font-mono">
                  {settings.statementPrefix}-{String(settings.statementCounter + 1).padStart(5, "0")}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
