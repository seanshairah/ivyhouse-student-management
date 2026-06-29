import { prisma } from "@/lib/prisma";

export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

/** Atomically increment a document counter and return the formatted number. */
export async function nextNumber(
  kind: "invoice" | "receipt" | "statement",
): Promise<string> {
  const field =
    kind === "invoice"
      ? "invoiceCounter"
      : kind === "receipt"
        ? "receiptCounter"
        : "statementCounter";
  const prefixField =
    kind === "invoice"
      ? "invoicePrefix"
      : kind === "receipt"
        ? "receiptPrefix"
        : "statementPrefix";

  const settings = await prisma.settings.upsert({
    where: { id: "singleton" },
    update: { [field]: { increment: 1 } },
    create: { id: "singleton", [field]: 1001 },
    select: { [field]: true, [prefixField]: true },
  });

  const counter = (settings as Record<string, number | string>)[field] as number;
  const prefix = (settings as Record<string, number | string>)[
    prefixField
  ] as string;
  return `${prefix}-${String(counter).padStart(5, "0")}`;
}
