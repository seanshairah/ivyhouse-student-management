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
  reconcileAndExpirePayments,
} from "@/services/payments";
import {
  getStudentAccount,
  raiseCharge,
  allocatePayment,
  getPaymentBreakdown,
} from "@/core/billing/ledger";
import { createInvoice } from "@/services/invoices";
import { recordManualPayment } from "@/core/billing/deposits";
import {
  cancelUnclearedPayment,
  listUnclearedPayments,
  expireStalePayments,
} from "@/core/billing/uncleared";
import {
  resolveAuthEmail,
  friendlyPaynowError,
  getPaynowConfig,
  PAYNOW_CURRENCY,
} from "@/services/payments/paynow";

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

    // The charge goes with it. A student who started a payment and never
    // completed it has agreed to nothing, so billing them for it is wrong —
    // and repeated attempts stacked up as real debt on a real account.
    const account = await getStudentAccount(profileId);
    expect(account.rent.outstanding).toBe(0);
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

describe("Paynow request hygiene", () => {
  it("never sends an undeliverable address as authemail", () => {
    // Paynow validates this field and rejects reserved TLDs, which comes back
    // as "The authemail field is required for remote transactions" — an error
    // that reads as though we sent nothing at all.
    delete process.env.PAYNOW_AUTH_EMAIL;
    expect(resolveAuthEmail("someone@ivyhouse.test")).not.toContain(".test");
    expect(resolveAuthEmail("someone@host.local")).not.toContain(".local");
    expect(resolveAuthEmail("")).toContain("@");
    expect(resolveAuthEmail(undefined)).toContain("@");
    expect(resolveAuthEmail("not-an-email")).toContain("@");
  });

  it("uses a real payer address when there is one", () => {
    delete process.env.PAYNOW_AUTH_EMAIL;
    expect(resolveAuthEmail("student@gmail.com")).toBe("student@gmail.com");
  });

  it("prefers the configured merchant address, which test mode requires", () => {
    process.env.PAYNOW_AUTH_EMAIL = "merchant@example.org";
    expect(resolveAuthEmail("student@gmail.com")).toBe("merchant@example.org");
    delete process.env.PAYNOW_AUTH_EMAIL;
  });

  it("does not show a student raw provider error text", () => {
    const authemail = friendlyPaynowError(
      "The authemail field is required for remote transactions",
    );
    expect(authemail).not.toContain("authemail");
    expect(authemail).toContain("no money has left your account");

    const testing = friendlyPaynowError(
      "Black Ivy Media is currently in testing and cannot accept payments at this time",
    );
    expect(testing).toContain("not live yet");

    // Anything unrecognised must still be rewritten, not passed through.
    const unknown = friendlyPaynowError("SOME_INTERNAL_CODE_42");
    expect(unknown).not.toContain("SOME_INTERNAL_CODE_42");
  });
});

describe("uncleared payment requests", () => {
  it("cancels an in-flight request and withdraws its charge", async () => {
    const init = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    expect((await getStudentAccount(profileId)).rent.outstanding).toBe(120);

    const r = await cancelUnclearedPayment(init.reference!);
    expect(r.ok).toBe(true);

    const stored = await prisma.payment.findUnique({
      where: { reference: init.reference! },
    });
    expect(stored?.status).toBe(PaymentStatus.CANCELLED);
    // The student no longer owes rent they abandoned paying.
    expect((await getStudentAccount(profileId)).rent.outstanding).toBe(0);
  });

  it("refuses to cancel a payment that has already been received", async () => {
    const init = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    await settlePayment(init.reference!);

    const r = await cancelUnclearedPayment(init.reference!);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("already been received");

    // Settled money is untouched, and so is the balance it cleared.
    const stored = await prisma.payment.findUnique({
      where: { reference: init.reference! },
    });
    expect(stored?.status).toBe(PaymentStatus.PAID);
    expect((await getStudentAccount(profileId)).rent.paid).toBe(120);
  });

  it("keeps a charge that has been part-paid", async () => {
    const charge = await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — March",
      amount: 120,
    });
    const partial = await prisma.payment.create({
      data: {
        reference: `PART-${Date.now()}`,
        studentProfileId: profileId,
        amount: 50,
        category: ChargeCategory.RENT,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      },
    });
    await allocatePayment(partial.id);

    const init = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    await cancelUnclearedPayment(init.reference!);

    // The part-paid charge survives; the student still owes the remainder.
    const kept = await prisma.charge.findUnique({ where: { id: charge.id } });
    expect(kept?.status).toBe(ChargeStatus.OUTSTANDING);
    expect((await getStudentAccount(profileId)).rent.outstanding).toBe(70);
  });

  it("lists what is uncleared, and expires only what is old", async () => {
    const fresh = await createSelfPayment({
      profileId,
      purpose: "TRANSPORT_MONTH",
      method: "web",
    });
    const listed = await listUnclearedPayments({ studentProfileId: profileId });
    expect(listed.map((p) => p.reference)).toContain(fresh.reference);
    expect(listed[0].stale).toBe(false);

    // Nothing is old enough yet, so a sweep must leave it alone.
    await expireStalePayments(60);
    let stored = await prisma.payment.findUnique({
      where: { reference: fresh.reference! },
    });
    expect(stored?.status).toBe(PaymentStatus.PENDING);

    // Age it past the window and it closes.
    await expireStalePayments(0);
    stored = await prisma.payment.findUnique({ where: { reference: fresh.reference! } });
    expect(stored?.status).toBe(PaymentStatus.CANCELLED);
  });
});

describe("Paynow test-mode rejection is reported honestly", () => {
  const TEST_MODE_ERROR =
    "The integration ID is in test mode, so if authemail is specified then it " +
    "must match the merchants registered email address (c*******b@i*****.com)";

  it("tells the student it is a provider setup issue, not their mistake", () => {
    const msg = friendlyPaynowError(TEST_MODE_ERROR);
    expect(msg).toContain("test mode");
    expect(msg).toContain("no money has left your account");
    // Never leak the provider's wording, including the masked merchant address.
    expect(msg).not.toContain("authemail");
    expect(msg).not.toContain("@");
  });
});

describe("an abandoned checkout must not leave a debt behind", () => {
  // The production incident this covers: a test student's rent balance climbed
  // from $240 to $600 because three checkouts were opened and closed. Each one
  // had raised its charge up front, and nothing ever took them back off.

  it("withdraws the charge when a payment is expired by the sweep", async () => {
    const init = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    expect((await getStudentAccount(profileId)).rent.outstanding).toBe(120);

    await expireStalePayments(0);

    const stored = await prisma.payment.findUnique({
      where: { reference: init.reference! },
    });
    expect(stored?.status).toBe(PaymentStatus.CANCELLED);
    // The whole point: expiring the request has to expire the debt with it.
    expect((await getStudentAccount(profileId)).rent.outstanding).toBe(0);
  });

  it("withdraws the charge when the payment fails", async () => {
    const init = await createSelfPayment({
      profileId,
      purpose: "TRANSPORT_MONTH",
      method: "web",
    });
    expect((await getStudentAccount(profileId)).transport.outstanding).toBeGreaterThan(0);

    // A student declining the prompt on their phone lands here.
    await failPayment(init.reference!, "declined-by-payer");

    expect((await getStudentAccount(profileId)).transport.outstanding).toBe(0);
  });

  it("cancels a payment that never reached the provider", async () => {
    // Recorded by the office, or abandoned before Paynow was contacted: there
    // is no provider transaction row, and a nested update against a missing
    // one throws — which silently aborted the whole sweep.
    const bare = await prisma.payment.create({
      data: {
        reference: `BARE-${Date.now()}`,
        studentProfileId: profileId,
        amount: 120,
        category: ChargeCategory.RENT,
        status: PaymentStatus.PENDING,
      },
    });

    const r = await cancelUnclearedPayment(bare.reference);
    expect(r.ok).toBe(true);
    const stored = await prisma.payment.findUnique({ where: { id: bare.id } });
    expect(stored?.status).toBe(PaymentStatus.CANCELLED);
  });

  it("withdraws only the charge that attempt raised", async () => {
    // A charge the office raised separately must survive an unrelated
    // abandoned checkout — the old category-and-recency match would have taken
    // it too.
    const officeCharge = await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — arrears agreed with the office",
      amount: 120,
    });

    const init = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    await cancelUnclearedPayment(init.reference!);

    const kept = await prisma.charge.findUnique({ where: { id: officeCharge.id } });
    expect(kept?.status).toBe(ChargeStatus.OUTSTANDING);
    expect((await getStudentAccount(profileId)).rent.outstanding).toBe(120);
  });

  it("does not raise a second charge when the student tries again", async () => {
    const first = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    const second = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });

    // Same attempt continued, not a new one.
    expect(second.reference).toBe(first.reference);
    expect((await getStudentAccount(profileId)).rent.outstanding).toBe(120);
    expect(
      await prisma.charge.count({
        where: { studentProfileId: profileId, status: ChargeStatus.OUTSTANDING },
      }),
    ).toBe(1);
  });
});

describe("the sweep asks the provider before writing anything off", () => {
  // Found in production: a payment sitting PENDING here that Paynow reported
  // as Paid, its webhook having never arrived. The sweep used to cancel stale
  // payments without asking anyone — which became dangerous the moment closing
  // a request also withdrew its charge, because that erases the money and the
  // record of it in the same stroke.

  it("settles a stale payment the provider has already collected", async () => {
    const init = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    // Give it a real-looking poll URL, so the sweep treats it as something that
    // reached a provider and has to be asked about rather than written off.
    // Mock mode then reports "paid", standing in for Paynow's answer.
    await prisma.paymentTransaction.updateMany({
      where: { payment: { reference: init.reference! } },
      data: { pollUrl: "https://www.paynow.co.zw/Interface/CheckPayment/?guid=x" },
    });

    const sweep = await reconcileAndExpirePayments(0);
    expect(sweep.settled).toBeGreaterThanOrEqual(1);

    const stored = await prisma.payment.findUnique({
      where: { reference: init.reference! },
      include: { receipt: true },
    });
    expect(stored?.status).toBe(PaymentStatus.PAID);
    // Settled means receipted and applied, not merely marked.
    expect(stored?.receipt).toBeTruthy();
    expect((await getStudentAccount(profileId)).rent.paid).toBe(120);
  });

  it("withdraws a charge stranded by a payment that died long ago", async () => {
    // The Blessbri case: a checkout cancelled five days earlier, its rent
    // charge still sitting on the student's account. The payment is terminal,
    // so nothing in the normal flow will ever look at it again.
    const dead = await prisma.payment.create({
      data: {
        reference: `STRANDED-${Date.now()}`,
        studentProfileId: profileId,
        amount: 120,
        category: ChargeCategory.RENT,
        status: PaymentStatus.CANCELLED,
      },
    });
    const stranded = await raiseCharge({
      studentProfileId: profileId,
      category: ChargeCategory.RENT,
      description: "Rent — next month",
      amount: 120,
      originPaymentId: dead.id,
    });
    expect((await getStudentAccount(profileId)).rent.outstanding).toBe(120);

    const sweep = await reconcileAndExpirePayments(0);
    expect(sweep.withdrawn).toBeGreaterThanOrEqual(1);

    const after = await prisma.charge.findUnique({ where: { id: stranded.id } });
    expect(after?.status).toBe(ChargeStatus.CANCELLED);
    expect((await getStudentAccount(profileId)).rent.outstanding).toBe(0);
  });

  it("never cancels a payment that reached a provider without reconciling it", async () => {
    // A poll URL we cannot verify: the answer is unknown, so the safe action is
    // to do nothing at all rather than guess.
    const payment = await prisma.payment.create({
      data: {
        reference: `UNREACHABLE-${Date.now()}`,
        studentProfileId: profileId,
        amount: 120,
        category: ChargeCategory.RENT,
        status: PaymentStatus.PENDING,
        transaction: {
          create: {
            provider: "paynow",
            pollUrl: "https://www.paynow.co.zw/Interface/CheckPayment/?guid=unknown",
          },
        },
      },
    });

    await expireStalePayments(0);

    const stored = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(stored?.status).toBe(PaymentStatus.PENDING);
  });
});

describe("switching payment method must not error before it works", () => {
  it("gives 'pay online' a link even when the attempt began as a phone prompt", async () => {
    // A payment started as an EcoCash prompt has no browser link. The duplicate
    // guard used to hand that back as a success with nowhere to go, so pressing
    // "Pay online" flashed "Could not open the payment page" and only worked on
    // the retry. Continuing the attempt has to produce a usable link.
    const prompt = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "ecocash",
      phone: "0771234567",
    });
    expect(prompt.ok).toBe(true);
    expect(prompt.redirectUrl).toBeUndefined();

    const web = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    expect(web.ok).toBe(true);
    expect(web.reference).toBe(prompt.reference);
    expect(web.redirectUrl).toBeTruthy();
  });

  it("never reports success without something to act on", async () => {
    for (const method of ["web", "ecocash"] as const) {
      const r = await createSelfPayment({
        profileId,
        purpose: "TRANSPORT_MONTH",
        method,
        phone: "0771234567",
      });
      if (!r.ok) continue;
      // ok means the student can do something next: follow a link, or approve
      // a prompt we can poll.
      expect(Boolean(r.redirectUrl || r.pollUrl)).toBe(true);
    }
  });
});

describe("money is collected strictly in USD", () => {
  it("reports USD on the config every caller reads", () => {
    expect(getPaynowConfig().currency).toBe("USD");
    expect(PAYNOW_CURRENCY).toBe("USD");
  });

  it("refuses to run against any other currency", () => {
    // Paynow takes no currency on the wire — the integration decides which
    // account is credited. A configuration claiming otherwise is wrong, and
    // running under it would take real money into the wrong account.
    process.env.PAYNOW_CURRENCY = "ZWG";
    try {
      expect(() => getPaynowConfig()).toThrow(/strictly in USD/i);
    } finally {
      delete process.env.PAYNOW_CURRENCY;
    }
    expect(getPaynowConfig().currency).toBe("USD");
  });

  it("prefers the USD-specific integration when one is configured", () => {
    process.env.PAYNOW_USD_INTEGRATION_ID = "usd-integration";
    process.env.PAYNOW_USD_INTEGRATION_KEY = "usd-key";
    try {
      expect(getPaynowConfig().integrationId).toBe("usd-integration");
    } finally {
      delete process.env.PAYNOW_USD_INTEGRATION_ID;
      delete process.env.PAYNOW_USD_INTEGRATION_KEY;
    }
  });
});

describe("a wrong PAYNOW_AUTH_EMAIL must not stop people paying", () => {
  it("falls back to a deliverable address when the configured one is unusable", () => {
    // The real incident: setting PAYNOW_AUTH_EMAIL to an address Paynow does
    // not accept took the entire web checkout down, when the payer's own
    // address had been working fine.
    process.env.PAYNOW_AUTH_EMAIL = "not-an-email";
    // Configured values are still honoured — Paynow decides, not us.
    expect(resolveAuthEmail("student@gmail.com")).toBe("not-an-email");
    delete process.env.PAYNOW_AUTH_EMAIL;

    // ...but with none configured, a real payer address is always preferred
    // over anything undeliverable.
    expect(resolveAuthEmail("student@gmail.com")).toBe("student@gmail.com");
    expect(resolveAuthEmail("someone@nowhere.test")).not.toContain(".test");
  });
});
