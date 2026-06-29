import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  DashboardShell,
  type ShellNavItem,
} from "@/components/navigation/dashboard-shell";

const NAV: ShellNavItem[] = [
  { label: "Overview", href: "/owner", icon: "LayoutDashboard" },
  { label: "Houses", href: "/owner/houses", icon: "Building2" },
  { label: "Rooms", href: "/owner/rooms", icon: "DoorOpen" },
  { label: "Applications", href: "/owner/applications", icon: "FileText" },
  { label: "Students", href: "/owner/students", icon: "Users" },
  { label: "Payments", href: "/owner/payments", icon: "CreditCard" },
  { label: "Invoices", href: "/owner/invoices", icon: "ReceiptText" },
  { label: "Reports", href: "/owner/reports", icon: "BarChart3" },
  { label: "Services", href: "/owner/services", icon: "Wrench" },
  { label: "Messages", href: "/owner/messages", icon: "MessageSquare" },
  { label: "Settings", href: "/owner/settings", icon: "Settings" },
];

const MOBILE: ShellNavItem[] = [
  { label: "Home", href: "/owner", icon: "Home" },
  { label: "Students", href: "/owner/students", icon: "Users" },
  { label: "Payments", href: "/owner/payments", icon: "CreditCard" },
  { label: "Messages", href: "/owner/messages", icon: "MessageSquare" },
  { label: "More", href: "/owner/settings", icon: "Menu" },
];

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("OWNER");
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true },
  });

  return (
    <DashboardShell
      nav={NAV}
      mobileNav={MOBILE}
      brand="Ivy House"
      roleLabel="Owner"
      user={{
        name: user?.name ?? session.name,
        email: user?.email ?? session.email,
      }}
    >
      {children}
    </DashboardShell>
  );
}
