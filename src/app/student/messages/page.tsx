import Link from "next/link";
import { Bell, Megaphone, MessageSquare } from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { MessageOwnerForm } from "@/components/student/message-owner-form";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function StudentMessagesPage() {
  const session = await requireRole("STUDENT");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.userId },
  });

  const [announcements, notifications] = await Promise.all([
    prisma.announcement.findMany({
      where: {
        OR: [
          { audience: "ALL" },
          ...(profile?.houseId
            ? [{ audience: "HOUSE" as const, houseId: profile.houseId }]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Announcements, notifications & support" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Announcements */}
        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
            <CardDescription>Updates from your house owner</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcements.length ? (
              announcements.map((a) => (
                <div key={a.id} className="rounded-xl border border-border p-3.5">
                  <div className="flex items-start gap-2.5">
                    <Megaphone className="mt-0.5 size-4 shrink-0 text-brand-600" />
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{a.title}</p>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">
                        {a.body}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(a.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                icon={<Megaphone className="size-5" />}
                title="No announcements"
                description="You're all caught up."
              />
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Your activity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {notifications.length ? (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.link ?? "/student"}
                  className="block rounded-xl border border-border p-3.5 transition-colors hover:bg-accent"
                >
                  <div className="flex items-start gap-2.5">
                    <Bell
                      className={`mt-0.5 size-4 shrink-0 ${
                        n.isRead ? "text-muted-foreground" : "text-brand-600"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {n.body}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState
                icon={<Bell className="size-5" />}
                title="No notifications"
                description="We'll keep you posted here."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contact support */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-brand-600" />
            <CardTitle className="text-base">Message the owner</CardTitle>
          </div>
          <CardDescription>
            Have a question or concern? Send a message and the house owner will get back to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MessageOwnerForm />
        </CardContent>
      </Card>
    </div>
  );
}
