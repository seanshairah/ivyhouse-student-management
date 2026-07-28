import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import {
  PrismaClient,
  ChargeCategory,
  ChargeStatus,
  PaymentStatus,
  RoomType,
} from "@prisma/client";
import {
  createSelfPayment,
  settlePayment,
  pollAndSettle,
  failPayment,
  canTransition,
} from "@/services/payments";
import {
  getStudentAccount,
  raiseCharge,
  allocatePayment,
  getPaymentBreakdown,
} from "@/core/billing/ledger";
import { createInvoice } from "@/services/invoices";
import { recordManualPayment } from "@/core/billing/deposits";

/**
 * End-to-end payment tests.
 *
 * Paynow runs in mock mode (see tests/setup.ts) so nothing real is ever
 * charged; the mock reports "paid" on poll, which is what lets us drive the
 * full initiate → verify → settle → allocate path.
 */
const prisma = new PrismaClient();

let houseId: string;
let roomId: string;
let profileId: string;
let counter = 0;

beforeAll(async () => {
  const house = await prisma.house.create({
    data: {
      name: `Payments Test House ${Date.now()}`,
      slug: `payments-test-${Date.now()}`,
      description: "Fixture",
      location: "Test",
      amenities: [],
      services: [],
      rules: [],
      safetyInfo: [],
    },
  });
  houseId = house.id;
  const room = await prisma.room.create({
    data: {
      houseId,
      number: "T1",
      type: RoomType.SHARED_DOUBLE, // configured at $120/month
      capacity: 2,
      price: 120,
    },
  });
  roomId = room.id;
});

beforeEach(async () => {
  const user = await prisma.user.create({
    data: {
      email: `pay-${Date.now()}-${counter++}@test.local`,
      passwordHash: "x",
      name: "Payments Test",
      role: "STUDENT",
    },
  });
  const profile = await prisma.studentProfile.create({
    data: {
      userId: user.id,
      fullName: "Payments Test",
      email: user.email,
      phone: "0771234567",
      houseId,
      roomId,
    },
  });
  profileId = profile.id;
});

afterAll(async () => {
  await prisma.room.deleteMany({ where: { houseId } });
  await prisma.house.deleteMany({ where: { id: houseId } });
  await prisma.$disconnect();
});

describe("the amount is decided by the server, not the browser", () => {
  it("prices a month's rent from the student's own room tier", async () => {
    const result = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    expect(result.ok).toBe(true);
    // $120 comes from the platform config for SHARED_DOUBLE, not from input.
    expect(result.amount).toBe(120);
  });

  it("prices a semester as the configured number of months", async () => {
    const result = await createSelfPayment({
      profileId,
      purpose: "RENT_SEMESTER",
      method: "web",
    });
    expect(result.amount).toBe(480); // 120 * 4
  });

  it("prices transport at the flat configured fee", async () => {
    const result = await createSelfPayment({
      profileId,
      purpose: "TRANSPORT_MONTH",
      method: "web",
    });
    expect(result.amount).toBe(15);
  });
});

describe("initiating a payment raises the charge behind it", () => {
  it("creates an outstanding charge in the right category", async () => {
    await createSelfPayment({ profileId, purpose: "RENT_MONTH", method: "web" });

    const charges = await prisma.charge.findMany({ where: { studentProfileId: profileId } });
    expect(charges).toHaveLength(1);
    expect(charges[0].category).toBe(ChargeCategory.RENT);
    expect(Number(charges[0].amount)).toBe(120);
    expect(charges[0].status).toBe(ChargeStatus.OUTSTANDING);
    expect(charges[0].dueDate).toBeInstanceOf(Date);

    // The student now owes the money — previously a self-service payment
    // produced no charge at all and the balance stayed at zero.
    const account = await getStudentAccount(profileId);
    expect(account.rent.outstanding).toBe(120);
  });

  it("tags a transport payment so it can never be mistaken for rent", async () => {
    await createSelfPayment({ profileId, purpose: "TRANSPORT_MONTH", method: "web" });

    const account = await getStudentAccount(profileId);
    expect(account.transport.outstanding).toBe(15);
    expect(account.rent.outstanding).toBe(0);
  });
});

describe("settlement", () => {
  it("marks paid, issues a receipt and clears the balance atomically", async () => {
    const init = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    const { payment, receipt } = await settlePayment(init.reference!);

    expect(payment.status).toBe(PaymentStatus.PENDING); // pre-update snapshot
    const stored = await prisma.payment.findUnique({ where: { reference: init.reference! } });
    expect(stored?.status).toBe(PaymentStatus.PAID);
    expect(stored?.paidAt).toBeInstanceOf(Date);

    expect(receipt).toBeTruthy();
    expect(receipt!.number).toMatch(/^RCT-/);

    const account = await getStudentAccount(profileId);
    expect(account.rent.outstanding).toBe(0);
    expect(account.rent.paid).toBe(120);
  });

  it("settles rent and transport into their own balances", async () => {
    const rent = await createSelfPayment({ profileId, purpose: "RENT_MONTH", method: "web" });
    const transport = await createSelfPayment({
      profileId,
      purpose: "TRANSPORT_MONTH",
      method: "web",
    });

    let account = await getStudentAccount(profileId);
    expect(account.rent.outstanding).toBe(120);
    expect(account.transport.outstanding).toBe(15);
    expect(account.totalOutstanding).toBe(135);

    await settlePayment(transport.reference!);

    account = await getStudentAccount(profileId);
    // Only transport cleared. Rent is untouched.
    expect(account.transport.outstanding).toBe(0);
    expect(account.rent.outstanding).toBe(120);
    expect(account.totalOutstanding).toBe(120);

    await settlePayment(rent.reference!);
    account = await getStudentAccount(profileId);
    expect(account.totalOutstanding).toBe(0);
  });
});

describe("a duplicate callback must not charge the student twice", () => {
  it("is idempotent across repeated settlement of the same reference", async () => {
    const init = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });

    const first = await settlePayment(init.reference!);
    expect(first.alreadyPaid).toBe(false);

    // The webhook fires again, and the return page loads, and the client polls.
    const second = await settlePayment(init.reference!);
    const third = await pollAndSettle(init.reference!);

    expect(second.alreadyPaid).toBe(true);
    expect(third.status).toBe("paid");

    // Exactly one receipt, one allocation, and the balance is right.
    const receipts = await prisma.receipt.findMany({
      where: { payment: { reference: init.reference! } },
    });
    expect(receipts).toHaveLength(1);

    const account = await getStudentAccount(profileId);
    expect(account.rent.paid).toBe(120);
    expect(account.unallocatedCredit).toBe(0);
  });

  it("reuses an in-flight payment instead of starting a second one", async () => {
    const first = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    // Double-click: same student, same amount, seconds apart.
    const second = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });

    expect(second.reference).toBe(first.reference);
    const payments = await prisma.payment.findMany({ where: { studentProfileId: profileId } });
    expect(payments).toHaveLength(1);
  });
});

describe("payment state machine", () => {
  it("permits only the legal transitions", () => {
    expect(canTransition(PaymentStatus.PENDING, PaymentStatus.PAID)).toBe(true);
    expect(canTransition(PaymentStatus.PENDING, PaymentStatus.CANCELLED)).toBe(true);
    expect(canTransition(PaymentStatus.PROCESSING, PaymentStatus.PAID)).toBe(true);
    expect(canTransition(PaymentStatus.PAID, PaymentStatus.REFUNDED)).toBe(true);

    // The transitions that protect settled money.
    expect(canTransition(PaymentStatus.PAID, PaymentStatus.FAILED)).toBe(false);
    expect(canTransition(PaymentStatus.PAID, PaymentStatus.PENDING)).toBe(false);
    expect(canTransition(PaymentStatus.PAID, PaymentStatus.CANCELLED)).toBe(false);
    expect(canTransition(PaymentStatus.CANCELLED, PaymentStatus.PAID)).toBe(false);
    expect(canTransition(PaymentStatus.REFUNDED, PaymentStatus.PAID)).toBe(false);
  });

  it("ignores a late failure callback for an already-settled payment", async () => {
    const init = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    await settlePayment(init.reference!);

    // Provider sends a stale "failed" after the payment already succeeded.
    await failPayment(init.reference!, "late-failure-callback");

    const stored = await prisma.payment.findUnique({ where: { reference: init.reference! } });
    expect(stored?.status).toBe(PaymentStatus.PAID);

    // And the money is still on the ledger.
    const account = await getStudentAccount(profileId);
    expect(account.rent.paid).toBe(120);
    expect(account.rent.outstanding).toBe(0);
  });

  it("withdraws the charge when a payment is cancelled before settling", async () => {
    const init = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    await failPayment(init.reference!, "cancelled-by-user");

    const stored = await prisma.payment.findUnique({ where: { reference: init.reference! } });
    expect(stored?.status).toBe(PaymentStatus.FAILED);

    // The charge stands — the student still owes the rent they tried to pay.
    const account = await getStudentAccount(profileId);
    expect(account.rent.outstanding).toBe(120);
  });
});

describe("charges raised by an administrator", () => {
  it("moves the student's balance when an invoice is created", async () => {
    // An invoice is the document; the charge is the debt. Creating an invoice
    // without a charge used to print and email correctly while the student's
    // balance stayed exactly where it was.
    await createInvoice({
      studentProfileId: profileId,
      description: "Booking deposit",
      amount: 50,
      category: ChargeCategory.DEPOSIT,
      dueInDays: 7,
    });

    const account = await getStudentAccount(profileId);
    expect(account.other.outstanding).toBe(50);
    expect(account.totalOutstanding).toBe(50);
    // A deposit is not rent and must not show up as rent.
    expect(account.rent.outstanding).toBe(0);
  });

  it("keeps an administrator's transport charge out of the rent balance", async () => {
    await createInvoice({
      studentProfileId: profileId,
      description: "Transport — March",
      amount: 15,
      category: ChargeCategory.TRANSPORT,
    });

    const account = await getStudentAccount(profileId);
    expect(account.transport.outstanding).toBe(15);
    expect(account.rent.outstanding).toBe(0);
  });
});

describe("receipts say what the money was for", () => {
  it("describes a deposit as a deposit, not as accommodation", async () => {
    // The majority of real payments are deposits recorded by the office. The
    // receipt used to read "Accommodation payment" for every one of them.
    const charge = await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.DEPOSIT,
      description: "Booking deposit",
      amount: 20,
    });
    const payment = await prisma.payment.create({
      data: {
        reference: `RCT-TEST-${Date.now()}`,
        studentProfileId: profileId,
        amount: 20,
        category: ChargeCategory.DEPOSIT,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      },
    });
    await allocatePayment(payment.id);

    const breakdown = await getPaymentBreakdown(payment.id);
    expect(breakdown.total).toBe(20);
    expect(breakdown.lines).toHaveLength(1);
    expect(breakdown.lines[0].category).toBe(ChargeCategory.DEPOSIT);
    expect(breakdown.lines[0].label).toContain("Deposit");
    expect(breakdown.lines[0].description).toBe("Booking deposit");
    expect(charge.id).toBeTruthy();
  });

  it("itemises a payment that covered both rent and transport", async () => {
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
    const payment = await prisma.payment.create({
      data: {
        reference: `RCT-COMBI-${Date.now()}`,
        studentProfileId: profileId,
        amount: 135,
        category: ChargeCategory.RENT,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      },
    });
    await allocatePayment(payment.id);

    const breakdown = await getPaymentBreakdown(payment.id);
    const cats = breakdown.lines.map((l) => l.category).sort();
    expect(cats).toEqual([ChargeCategory.RENT, ChargeCategory.TRANSPORT].sort());
    expect(breakdown.lines.reduce((s, l) => s + l.amount, 0)).toBe(135);
  });

  it("shows unapplied money as credit rather than inventing a line for it", async () => {
    await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 100,
    });
    const payment = await prisma.payment.create({
      data: {
        reference: `RCT-OVER-${Date.now()}`,
        studentProfileId: profileId,
        amount: 150,
        category: ChargeCategory.RENT,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      },
    });
    await allocatePayment(payment.id);

    const breakdown = await getPaymentBreakdown(payment.id);
    expect(breakdown.lines.reduce((s, l) => s + l.amount, 0)).toBe(100);
    expect(breakdown.unapplied).toBe(50);
  });
});

describe("cash deposits recorded by the office", () => {
  it("categorises the deposit, settles it and issues a receipt", async () => {
    // The busiest path in both platforms. One used to write a bare Payment row
    // with no receipt at all; the other issued a receipt but left the category
    // at OTHER, so the owner's "deposits collected" total read zero.
    const result = await recordManualPayment({
      studentProfileId: profileId,
      amount: 20,
    });
    expect(result).not.toBeNull();

    expect(result!.charge.category).toBe(ChargeCategory.DEPOSIT);
    expect(result!.payment.category).toBe(ChargeCategory.DEPOSIT);
    expect(result!.payment.status).toBe(PaymentStatus.PAID);
    expect(result!.receipt.number).toMatch(/^RCT-/);

    // Settled on arrival: it is money already received, not money owed.
    const account = await getStudentAccount(profileId);
    expect(account.other.outstanding).toBe(0);
    expect(account.other.paid).toBe(20);
    expect(account.totalOutstanding).toBe(0);
    // And it must not be mistaken for rent.
    expect(account.rent.outstanding).toBe(0);
  });

  it("shows the deposit as a deposit on the receipt", async () => {
    const result = await recordManualPayment({
      studentProfileId: profileId,
      amount: 40,
    });
    const breakdown = await getPaymentBreakdown(result!.payment.id);
    expect(breakdown.lines[0].category).toBe(ChargeCategory.DEPOSIT);
    expect(breakdown.lines[0].label).toContain("Deposit");
    expect(breakdown.unapplied).toBe(0);
  });

  it("does not double-record a deposit for the same student", async () => {
    const first = await recordManualPayment({
      studentProfileId: profileId,
      amount: 20,
      onlyIfNone: true,
    });
    const second = await recordManualPayment({
      studentProfileId: profileId,
      amount: 20,
      onlyIfNone: true,
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();

    const payments = await prisma.payment.findMany({
      where: { studentProfileId: profileId, category: ChargeCategory.DEPOSIT },
    });
    expect(payments).toHaveLength(1);
  });

  it("counts toward the owner's deposit revenue figure", async () => {
    await recordManualPayment({ studentProfileId: profileId, amount: 30 });
    const byCategory = await prisma.payment.groupBy({
      by: ["category"],
      where: { studentProfileId: profileId, status: PaymentStatus.PAID },
      _sum: { amount: true },
    });
    const deposits = byCategory.find((r) => r.category === ChargeCategory.DEPOSIT);
    expect(Number(deposits?._sum.amount ?? 0)).toBe(30);
  });
});

describe("a student with no room", () => {
  it("cannot be charged rent for accommodation they were never given", async () => {
    const user = await prisma.user.create({
      data: {
        email: `noroom-${Date.now()}-${counter++}@test.local`,
        passwordHash: "x",
        name: "No Room",
        role: "STUDENT",
      },
    });
    const roomless = await prisma.studentProfile.create({
      data: {
        userId: user.id,
        fullName: "No Room",
        email: user.email,
        phone: "0771234567",
        houseId,
      },
    });

    // monthlyRentFor() falls back to the platform default, so without this
    // guard the student would be billed $120 for a room they don't have.
    const rent = await createSelfPayment({
      profileId: roomless.id,
      purpose: "RENT_MONTH",
      method: "web",
    });
    expect(rent.ok).toBe(false);
    expect(rent.error).toContain("room");

    const charges = await prisma.charge.findMany({
      where: { studentProfileId: roomless.id },
    });
    expect(charges).toHaveLength(0);

    // Transport does not depend on a room, so it stays available.
    const transport = await createSelfPayment({
      profileId: roomless.id,
      purpose: "TRANSPORT_MONTH",
      method: "web",
    });
    expect(transport.ok).toBe(true);
    expect(transport.amount).toBe(15);
  });
});
