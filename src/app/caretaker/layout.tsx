import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  DashboardShell,
  type ShellNavItem,
} from "@/components/navigation/dashboard-shell";

const NAV: ShellNavItem[] = [
  { label: "Home", href: "/caretaker", icon: "Home" },
  { label: "Services", href: "/caretaker/services", icon: "Wrench" },
  { label: "Messages", href: "/caretaker/messages", icon: "MessageSquare" },
];

export default async function CaretakerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("CARETAKER");
  const caretaker = await prisma.caretaker.findFirst({
    where: { OR: [{ userId: session.userId }, { email: session.email }] },
    select: { name: true, email: true },
  });

  const user = {
    name: caretaker?.name ?? session.name,
    email: caretaker?.email ?? session.email,
  };

  return (
    <DashboardShell
      nav={NAV}
      mobileNav={NAV}
      brand="Ivy House"
      roleLabel="Caretaker"
      user={user}
    >
      {children}
    </DashboardShell>
  );
}
