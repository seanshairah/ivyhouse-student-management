import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { RosterUploader } from "@/components/caretaker/roster-uploader";

// The apply step rebuilds dozens of ledgers; give it room beyond the default
// serverless slice. It is resumable regardless.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export default async function CaretakerImportPage() {
  const session = await requireRole(["CARETAKER", "OWNER"]);
  const caretaker = await prisma.caretaker.findFirst({
    where: { OR: [{ userId: session.userId }, { email: session.email }] },
    select: { house: { select: { name: true } } },
  });
  const house =
    caretaker?.house ??
    (await prisma.house.findFirst({
      orderBy: { createdAt: "asc" },
      select: { name: true },
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import a roster sheet"
        description={`Upload the Excel book for ${house?.name ?? "your house"} — rooms, students and payments are set to match it exactly.`}
      />
      <RosterUploader
        houseName={house?.name ?? "your house"}
        defaultPriceTwoShare={135}
        defaultPriceThreeShare={105}
      />
    </div>
  );
}
