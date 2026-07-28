import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, ChargeCategory, ChargeStatus, PaymentStatus } from "@prisma/client";
import {
  getStudentAccount,
  raiseCharge,
  allocatePayment,
  deallocatePayment,
} from "@/core/billing/ledger";

const prisma = new PrismaClient();

let houseId: string;
let profileId: string;
let counter = 0;

/** A settled payment of `amount` in `category`, ready to be allocated. */
async function paidPayment(amount: number, category: ChargeCategory) {
  return prisma.payment.create({
    data: {
      reference: `TEST-${Date.now()}-${counter++}`,
      studentProfileId: profileId,
      amount,
      category,
      status: PaymentStatus.PAID,
      paidAt: new Date(),
    },
  });
}

const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

beforeAll(async () => {
  const house = await prisma.house.create({
    data: {
      name: `Ledger Test House ${Date.now()}`,
      slug: `ledger-test-${Date.now()}`,
      description: "Fixture",
      location: "Test",
      amenities: [],
      services: [],
      rules: [],
      safetyInfo: [],
    },
  });
  houseId = house.id;
});

beforeEach(async () => {
  // Fresh student per test so balances start from a known zero.
  const user = await prisma.user.create({
    data: {
      email: `ledger-${Date.now()}-${counter++}@test.local`,
      passwordHash: "x",
      name: "Ledger Test",
      role: "STUDENT",
    },
  });
  const profile = await prisma.studentProfile.create({
    data: {
      userId: user.id,
      fullName: "Ledger Test",
      email: user.email,
      phone: "0770000000",
      houseId,
    },
  });
  profileId = profile.id;
});

afterAll(async () => {
  await prisma.house.deleteMany({ where: { id: houseId } });
  await prisma.$disconnect();
});

describe("balances are derived, and rent is separated from transport", () => {
  it("reports a zero account for a student with no charges", async () => {
    const account = await getStudentAccount(profileId);
    expect(account.totalOutstanding).toBe(0);
    expect(account.rent.outstanding).toBe(0);
    expect(account.transport.outstanding).toBe(0);
    expect(account.inArrears).toBe(false);
  });

  it("keeps rent and transport in separate buckets and sums them correctly", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 120,
      dueDate: daysFromNow(7),
    });
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.TRANSPORT,
      description: "Transport — March",
      amount: 15,
      dueDate: daysFromNow(7),
    });

    const account = await getStudentAccount(profileId);
    expect(account.rent.outstanding).toBe(120);
    expect(account.transport.outstanding).toBe(15);
    // The student can see each separately AND the combined position.
    expect(account.totalOutstanding).toBe(135);
  });

  it("does not count waived or cancelled charges toward the balance", async () => {
    const waived = await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — waived",
      amount: 120,
    });
    await prisma.charge.update({
      where: { id: waived.id },
      data: { status: ChargeStatus.WAIVED },
    });

    const account = await getStudentAccount(profileId);
    expect(account.totalOutstanding).toBe(0);
  });

  it("rejects a zero or negative charge", async () => {
    await expect(
      raiseCharge({
        studentProfileId: profileId,
        category: ChargeCategory.RENT,
        description: "Bad",
        amount: 0,
      }),
    ).rejects.toThrow();
  });
});

describe("payment allocation", () => {
  it("settles a rent charge with a rent payment", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 120,
    });
    const payment = await paidPayment(120, ChargeCategory.RENT);

    const result = await allocatePayment(payment.id);
    expect(result.allocated).toBe(120);
    expect(result.credit).toBe(0);

    const account = await getStudentAccount(profileId);
    expect(account.rent.outstanding).toBe(0);
    expect(account.rent.paid).toBe(120);
    expect(account.totalOutstanding).toBe(0);
  });

  it("applies a transport payment to transport debt, never to rent", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 120,
      dueDate: daysFromNow(1), // older/sooner than the transport charge
    });
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.TRANSPORT,
      description: "Transport — March",
      amount: 15,
      dueDate: daysFromNow(20),
    });

    const payment = await paidPayment(15, ChargeCategory.TRANSPORT);
    await allocatePayment(payment.id);

    const account = await getStudentAccount(profileId);
    // Even though the rent charge is due sooner, category wins: the transport
    // payment cleared transport.
    expect(account.transport.outstanding).toBe(0);
    expect(account.rent.outstanding).toBe(120);
  });

  it("supports a partial payment, leaving the remainder outstanding", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 120,
    });
    const payment = await paidPayment(50, ChargeCategory.RENT);
    await allocatePayment(payment.id);

    const account = await getStudentAccount(profileId);
    expect(account.rent.paid).toBe(50);
    expect(account.rent.outstanding).toBe(70);

    const charge = await prisma.charge.findFirst({ where: { studentProfileId: profileId } });
    expect(charge?.status).toBe(ChargeStatus.OUTSTANDING);
  });

  it("supports a combined payment covering rent and transport at once", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 120,
    });
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.TRANSPORT,
      description: "Transport — March",
      amount: 15,
    });

    const payment = await paidPayment(135, ChargeCategory.RENT);
    const result = await allocatePayment(payment.id);

    expect(result.allocated).toBe(135);
    const account = await getStudentAccount(profileId);
    expect(account.rent.outstanding).toBe(0);
    expect(account.transport.outstanding).toBe(0);
    expect(account.totalOutstanding).toBe(0);
  });

  it("holds an overpayment as credit instead of losing it", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 100,
    });
    const payment = await paidPayment(150, ChargeCategory.RENT);
    const result = await allocatePayment(payment.id);

    expect(result.allocated).toBe(100);
    expect(result.credit).toBe(50);

    const account = await getStudentAccount(profileId);
    expect(account.totalOutstanding).toBe(0);
    expect(account.unallocatedCredit).toBe(50);
  });

  it("never lets a pending payment move the balance", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 120,
    });
    const pending = await prisma.payment.create({
      data: {
        reference: `TEST-PENDING-${Date.now()}`,
        studentProfileId: profileId,
        amount: 120,
        category: ChargeCategory.RENT,
        status: PaymentStatus.PENDING,
      },
    });

    const result = await allocatePayment(pending.id);
    expect(result.allocated).toBe(0);

    const account = await getStudentAccount(profileId);
    expect(account.rent.outstanding).toBe(120);
  });
});

describe("idempotency — a replayed callback must not pay the debt twice", () => {
  it("produces the same balance no matter how many times allocation runs", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 120,
    });
    const payment = await paidPayment(120, ChargeCategory.RENT);

    // Simulates the webhook firing, the return page loading, and the client
    // poll all settling the same payment.
    await allocatePayment(payment.id);
    await allocatePayment(payment.id);
    await allocatePayment(payment.id);

    const allocations = await prisma.paymentAllocation.findMany({
      where: { paymentId: payment.id },
    });
    expect(allocations).toHaveLength(1);

    const account = await getStudentAccount(profileId);
    expect(account.rent.paid).toBe(120);
    expect(account.totalOutstanding).toBe(0);
    // The critical assertion: three settlements did NOT create $360 of credit.
    expect(account.unallocatedCredit).toBe(0);
  });
});

describe("refunds and reversals", () => {
  it("returns a settled charge to outstanding when the payment is reversed", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 120,
    });
    const payment = await paidPayment(120, ChargeCategory.RENT);
    await allocatePayment(payment.id);

    expect((await getStudentAccount(profileId)).rent.outstanding).toBe(0);

    await deallocatePayment(payment.id);

    const account = await getStudentAccount(profileId);
    expect(account.rent.outstanding).toBe(120);
    const charge = await prisma.charge.findFirst({ where: { studentProfileId: profileId } });
    expect(charge?.status).toBe(ChargeStatus.OUTSTANDING);
  });
});

describe("arrears", () => {
  it("counts only overdue outstanding amounts as arrears", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — overdue",
      amount: 120,
      dueDate: daysFromNow(-10),
    });
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.TRANSPORT,
      description: "Transport — not yet due",
      amount: 15,
      dueDate: daysFromNow(10),
    });

    const account = await getStudentAccount(profileId);
    expect(account.totalOutstanding).toBe(135);
    expect(account.totalArrears).toBe(120);
    expect(account.rent.arrears).toBe(120);
    expect(account.transport.arrears).toBe(0);
    expect(account.inArrears).toBe(true);
  });

  it("clears arrears once the overdue charge is paid", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — overdue",
      amount: 120,
      dueDate: daysFromNow(-10),
    });
    const payment = await paidPayment(120, ChargeCategory.RENT);
    await allocatePayment(payment.id);

    const account = await getStudentAccount(profileId);
    expect(account.totalArrears).toBe(0);
    expect(account.inArrears).toBe(false);
  });

  it("surfaces the earliest unpaid due date as the next due date", async () => {
    const soon = daysFromNow(3);
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.TRANSPORT,
      description: "Transport",
      amount: 15,
      dueDate: soon,
    });
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent",
      amount: 120,
      dueDate: daysFromNow(30),
    });

    const account = await getStudentAccount(profileId);
    expect(account.nextDueDate?.toDateString()).toBe(soon.toDateString());
  });
});

describe("credit is not left stranded", () => {
  it("applies existing credit to the next charge raised", async () => {
    // Student overpays: $150 against a $100 charge, leaving $50 credit.
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 100,
    });
    const payment = await paidPayment(150, ChargeCategory.RENT);
    await allocatePayment(payment.id);

    let account = await getStudentAccount(profileId);
    expect(account.unallocatedCredit).toBe(50);

    // Next month's rent is raised. The credit should reduce it, not sit idle
    // while the student is chased for the full amount.
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — April",
      amount: 120,
    });

    account = await getStudentAccount(profileId);
    expect(account.rent.outstanding).toBe(70); // 120 - 50 credit
    expect(account.unallocatedCredit).toBe(0);
  });

  it("settles a new charge outright when the credit covers it", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 50,
    });
    const payment = await paidPayment(200, ChargeCategory.RENT);
    await allocatePayment(payment.id);

    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.TRANSPORT,
      description: "Transport — April",
      amount: 15,
    });

    const account = await getStudentAccount(profileId);
    expect(account.transport.outstanding).toBe(0);
    expect(account.totalOutstanding).toBe(0);
    expect(account.unallocatedCredit).toBe(135); // 200 - 50 - 15
  });

  it("leaves a charge outstanding when there is no credit", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 120,
    });
    const account = await getStudentAccount(profileId);
    expect(account.rent.outstanding).toBe(120);
    expect(account.unallocatedCredit).toBe(0);
  });
});
