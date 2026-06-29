import { Megaphone, MessageSquare, Mail } from "lucide-react";
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
import { NoteForm } from "@/components/caretaker/note-form";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function CaretakerMessagesPage() {
  const session = await requireRole("CARETAKER");
  const caretaker = await prisma.caretaker.findFirst({
    where: { OR: [{ userId: session.userId }, { email: session.email }] },
    select: { houseId: true, email: true },
  });

  const recipientEmail = caretaker?.email ?? session.email;

  const [announcements, messages] = await Promise.all([
    prisma.announcement.findMany({
      where: {
        OR: [
          { audience: "ALL" },
          { audience: "CARETAKERS" },
          ...(caretaker?.houseId
            ? [{ audience: "HOUSE" as const, houseId: caretaker.houseId }]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.messageLog.findMany({
      where: { recipient: recipientEmail },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Updates from the owner & your notes" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Announcements */}
        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
            <CardDescription>From the house owner</CardDescription>
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
                description="Nothing from the owner yet."
              />
            )}
          </CardContent>
        </Card>

        {/* Direct messages */}
        <Card>
          <CardHeader>
            <CardTitle>Messages</CardTitle>
            <CardDescription>Sent to you directly</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {messages.length ? (
              messages.map((m) => (
                <div key={m.id} className="rounded-xl border border-border p-3.5">
                  <div className="flex items-start gap-2.5">
                    <Mail className="mt-0.5 size-4 shrink-0 text-brand-600" />
                    <div className="min-w-0">
                      {m.subject && (
                        <p className="font-medium leading-snug">{m.subject}</p>
                      )}
                      <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">
                        {m.body}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                icon={<Mail className="size-5" />}
                title="No messages"
                description="Direct messages will appear here."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Note to owner */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-brand-600" />
            <CardTitle className="text-base">Send a note to the owner</CardTitle>
          </div>
          <CardDescription>
            Need something or want to flag an issue? Send a quick note.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NoteForm />
        </CardContent>
      </Card>
    </div>
  );
}
