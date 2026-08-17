import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { NotifyHouseForm } from "@/components/caretaker/notify-house-form";

export default async function CaretakerNotifyPage() {
  const session = await requireRole(["CARETAKER", "OWNER"]);
  const caretaker = await prisma.caretaker.findFirst({
    where: { OR: [{ userId: session.userId }, { email: session.email }] },
    select: { houseId: true, house: { select: { name: true } } },
  });

  const count = await prisma.studentProfile.count({
    where: {
      ...(caretaker?.houseId ? { houseId: caretaker.houseId } : {}),
      status: { notIn: ["ARCHIVED", "MOVED_OUT"] },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notify students"
        description={
          caretaker?.house
            ? `Email or SMS everyone in ${caretaker.house.name} at once.`
            : "Email or SMS all current students at once."
        }
      />
      <NotifyHouseForm studentCount={count} />
    </div>
  );
}
