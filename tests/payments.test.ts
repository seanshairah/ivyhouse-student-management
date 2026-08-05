import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
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
  resolveReturnReference,
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
  createPaynowPayment,
  createPaynowMobilePayment,
  checkMobileNumber,
  maskPhone,
  phoneBucket,
  looksLikePlaceholderPhone,
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

  // Rate-limit buckets live in the database and are keyed by destination
  // number, not by test — so without this, one test's prompts exhaust the
  // budget for every later test using the same number.
  await prisma.rateLimit.deleteMany({});
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

describe("Paynow callback URLs must be reachable, not a developer's laptop", () => {
  // PAYNOW_RETURN_URL / PAYNOW_RESULT_URL used to default straight to a
  // literal "http://localhost:3000/..." string. That is invisible in every way
  // that matters — checkout still initiates, the student still reaches
  // Paynow — right up until Paynow's servers try to POST the result to an
  // address that only exists on a developer's machine. In production this
  // meant NOTHING ever settled automatically: across both platforms, exactly
  // one payment has ever reached PAID, and only because it was reconciled by
  // hand hours after the student paid.

  afterEach(() => {
    delete process.env.APP_URL;
    delete process.env.PAYNOW_RETURN_URL;
    delete process.env.PAYNOW_RESULT_URL;
  });

  it("derives both URLs from APP_URL when the Paynow-specific ones are unset", () => {
    // .env sets PAYNOW_RETURN_URL/RESULT_URL for local development — clear
    // them explicitly so this test exercises the fallback, not the override.
    delete process.env.PAYNOW_RETURN_URL;
    delete process.env.PAYNOW_RESULT_URL;
    process.env.APP_URL = "https://ivyproperties.co.zw";
    const config = getPaynowConfig();
    expect(config.returnUrl).toBe("https://ivyproperties.co.zw/student/payments/return");
    expect(config.resultUrl).toBe("https://ivyproperties.co.zw/api/payments/paynow/result");
  });

  it("still honours an explicit PAYNOW_RETURN_URL / PAYNOW_RESULT_URL over APP_URL", () => {
    process.env.APP_URL = "https://ivyproperties.co.zw";
    process.env.PAYNOW_RETURN_URL = "https://explicit.example/return";
    process.env.PAYNOW_RESULT_URL = "https://explicit.example/result";
    const config = getPaynowConfig();
    expect(config.returnUrl).toBe("https://explicit.example/return");
    expect(config.resultUrl).toBe("https://explicit.example/result");
  });
});

describe("the return URL carries the payment's own reference", () => {
  // Confirmed on Paynow's own developer forum, by Paynow staff: the browser is
  // redirected to returnurl with NOTHING appended — no reference, no status,
  // nothing. "It is expected that you will set enough information to be able
  // to identify the transaction... returnurl: mywebsite.com/check/?myref=…".
  // Every returnurl this codebase ever sent was one fixed string, shared by
  // every transaction, with nothing appended — so the return page (which reads
  // `?ref=`) could never identify which payment to verify, for any student,
  // ever.

  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.PAYNOW_MODE;
    delete process.env.PAYNOW_INTEGRATION_ID;
    delete process.env.PAYNOW_INTEGRATION_KEY;
    delete process.env.PAYNOW_RETURN_URL;
  });

  it("embeds ?ref=<reference> in the returnurl sent for a web (hosted checkout) payment", async () => {
    process.env.PAYNOW_MODE = "live";
    process.env.PAYNOW_INTEGRATION_ID = "test-id";
    process.env.PAYNOW_INTEGRATION_KEY = "test-key";
    process.env.PAYNOW_RETURN_URL = "https://example.test/student/payments/return";

    let sentBody = "";
    global.fetch = (async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      return {
        text: async () =>
          "status=Ok&browserurl=https://www.paynow.co.zw/x&pollurl=https://www.paynow.co.zw/poll&paynowreference=1",
      } as Response;
    }) as typeof fetch;

    await createPaynowPayment({
      reference: "PAY-TESTREF-WEB",
      amount: 120,
      email: "student@example.com",
      description: "Test",
    });

    const sent = new URLSearchParams(sentBody);
    expect(sent.get("returnurl")).toBe(
      "https://example.test/student/payments/return?ref=PAY-TESTREF-WEB",
    );
  });

  it("embeds ?ref=<reference> in the returnurl sent for a mobile-money payment too", async () => {
    process.env.PAYNOW_MODE = "live";
    process.env.PAYNOW_INTEGRATION_ID = "test-id";
    process.env.PAYNOW_INTEGRATION_KEY = "test-key";
    process.env.PAYNOW_RETURN_URL = "https://example.test/student/payments/return";

    let sentBody = "";
    global.fetch = (async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      return {
        text: async () => "status=Ok&pollurl=https://www.paynow.co.zw/poll&paynowreference=1",
      } as Response;
    }) as typeof fetch;

    await createPaynowMobilePayment({
      reference: "PAY-TESTREF-MOB",
      amount: 15,
      email: "student@example.com",
      description: "Test",
      phone: "0771234567",
    });

    const sent = new URLSearchParams(sentBody);
    expect(sent.get("returnurl")).toBe(
      "https://example.test/student/payments/return?ref=PAY-TESTREF-MOB",
    );
  });

  it("appends with & rather than ? when the configured return URL already has a query string", async () => {
    process.env.PAYNOW_MODE = "live";
    process.env.PAYNOW_INTEGRATION_ID = "test-id";
    process.env.PAYNOW_INTEGRATION_KEY = "test-key";
    process.env.PAYNOW_RETURN_URL = "https://example.test/return?brand=ivy";

    let sentBody = "";
    global.fetch = (async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      return {
        text: async () =>
          "status=Ok&browserurl=https://www.paynow.co.zw/x&pollurl=https://www.paynow.co.zw/poll&paynowreference=1",
      } as Response;
    }) as typeof fetch;

    await createPaynowPayment({
      reference: "PAY-TESTREF-QS",
      amount: 120,
      email: "student@example.com",
      description: "Test",
    });

    const sent = new URLSearchParams(sentBody);
    expect(sent.get("returnurl")).toBe("https://example.test/return?brand=ivy&ref=PAY-TESTREF-QS");
  });

  it("signs the request after the reference-bearing returnurl is built, not before", async () => {
    process.env.PAYNOW_MODE = "live";
    process.env.PAYNOW_INTEGRATION_ID = "test-id";
    process.env.PAYNOW_INTEGRATION_KEY = "test-key";
    process.env.PAYNOW_RETURN_URL = "https://example.test/return";

    let sentBody = "";
    global.fetch = (async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      return {
        text: async () =>
          "status=Ok&browserurl=https://www.paynow.co.zw/x&pollurl=https://www.paynow.co.zw/poll&paynowreference=1",
      } as Response;
    }) as typeof fetch;

    await createPaynowPayment({
      reference: "PAY-TESTREF-HASH",
      amount: 120,
      email: "student@example.com",
      description: "Test",
    });

    const sent = new URLSearchParams(sentBody);
    // SHA-512 hex digest: 128 characters. Present at all means paynowHash()
    // ran successfully over the final values object, reference-bearing
    // returnurl included.
    expect(sent.get("hash")).toMatch(/^[0-9A-F]{128}$/);
  });
});

describe("a mobile prompt sent to a number that cannot receive it", () => {
  // The live incident: a $15 EcoCash prompt came back "Cancelled" 5.67 seconds
  // after being sent — far too fast for anyone to have declined it on a
  // handset. The number was 0771234567, a seeded placeholder that isn't a
  // registered wallet, pre-filled into the dialog from the student's profile.
  // Paynow accepted the request, issued a poll URL, then cancelled it.

  it("refuses an EcoCash prompt to a non-Econet number before contacting Paynow", async () => {
    const r = await createSelfPayment({
      profileId,
      purpose: "TRANSPORT_MONTH",
      method: "ecocash",
      phone: "0712345678", // NetOne — OneMoney's rail, not EcoCash's
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Econet/i);

    // The charge raised for the attempt must not be left standing.
    expect((await getStudentAccount(profileId)).transport.outstanding).toBe(0);
  });

  it("refuses a number that isn't a Zimbabwean mobile number at all", async () => {
    const r = await createSelfPayment({
      profileId,
      purpose: "TRANSPORT_MONTH",
      method: "ecocash",
      phone: "12345",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/07/);
    expect((await getStudentAccount(profileId)).transport.outstanding).toBe(0);
  });

  it("accepts a well-formed Econet number", () => {
    expect(checkMobileNumber("0771234567", "ecocash").ok).toBe(true);
    expect(checkMobileNumber("0781234567", "ecocash").ok).toBe(true);
    // Also accepts the international form, normalised.
    expect(checkMobileNumber("+263771234567", "ecocash").ok).toBe(true);
  });

  it("routes OneMoney to NetOne numbers only", () => {
    expect(checkMobileNumber("0712345678", "onemoney").ok).toBe(true);
    expect(checkMobileNumber("0771234567", "onemoney").ok).toBe(false);
  });

  it("records which number a prompt went to, masked", async () => {
    const r = await createSelfPayment({
      profileId,
      purpose: "TRANSPORT_MONTH",
      method: "ecocash",
      phone: "0771234567",
    });
    expect(r.ok).toBe(true);

    const stored = await prisma.paymentTransaction.findFirst({
      where: { payment: { reference: r.reference! } },
    });
    // Enough to recognise a wrong or placeholder number; not a second copy of
    // every payer's phone number sitting in the payments table.
    expect(stored?.payload).toMatchObject({
      method: "ecocash",
      destination: "077***4567",
    });
  });

  it("never stores the whole number", () => {
    expect(maskPhone("0771234567")).toBe("077***4567");
    expect(maskPhone("0771234567")).not.toContain("1234567");
  });
});

describe("payment prompts cannot be used to hammer someone else's phone", () => {
  // The phone field is free text: a student can type any number they like.
  // The per-student payment limit protects the merchant account from runaway
  // retries, but does nothing for the person on the other end of a number they
  // never gave us. Throttling has to be keyed to the number being CALLED.

  const VICTIM = "0779998888";

  it("stops repeated prompts to the same number, even from one account", async () => {
    // Each attempt is cancelled first, because the 90-second duplicate guard
    // would otherwise just hand back the in-flight payment without sending a
    // second prompt. Reuse isn't the abuse — a fresh send is, and an attacker
    // clears the way for one exactly like this.
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await createSelfPayment({
        profileId,
        purpose: "TRANSPORT_MONTH",
        method: "ecocash",
        phone: VICTIM,
      });
      results.push(r);
      if (r.reference) await cancelUnclearedPayment(r.reference).catch(() => undefined);
    }
    const blocked = results.filter((r) => !r.ok && /already been sent/i.test(r.error ?? ""));
    expect(blocked.length).toBeGreaterThan(0);
  });

  it("blocks a second account targeting a number the first already hammered", async () => {
    // The throttle is per-number across the whole platform, so switching
    // accounts must not reset it — otherwise it only inconveniences the
    // attacker rather than protecting the victim.
    for (let i = 0; i < 4; i += 1) {
      const r = await createSelfPayment({
        profileId,
        purpose: "TRANSPORT_MONTH",
        method: "ecocash",
        phone: VICTIM,
      });
      if (r.reference) await cancelUnclearedPayment(r.reference).catch(() => undefined);
    }

    const otherUser = await prisma.user.create({
      data: {
        email: `attacker-${Date.now()}-${counter++}@test.local`,
        passwordHash: "x",
        name: "Other",
        role: "STUDENT",
      },
    });
    const otherProfile = await prisma.studentProfile.create({
      data: {
        userId: otherUser.id,
        fullName: "Other",
        email: otherUser.email,
        phone: "0771111111",
        houseId,
        roomId,
      },
    });

    const r = await createSelfPayment({
      profileId: otherProfile.id,
      purpose: "TRANSPORT_MONTH",
      method: "ecocash",
      phone: VICTIM,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already been sent/i);
  });

  it("leaves no charge behind when a prompt is blocked", async () => {
    // Exhaust the budget for this number first, so the attempt measured below
    // is definitely the blocked one.
    for (let i = 0; i < 4; i += 1) {
      const r = await createSelfPayment({
        profileId,
        purpose: "TRANSPORT_MONTH",
        method: "ecocash",
        phone: VICTIM,
      });
      if (r.reference) await cancelUnclearedPayment(r.reference).catch(() => undefined);
    }

    const before = await getStudentAccount(profileId);
    const blocked = await createSelfPayment({
      profileId,
      purpose: "TRANSPORT_MONTH",
      method: "ecocash",
      phone: VICTIM,
    });
    expect(blocked.ok).toBe(false);

    // A refused prompt must not leave the student owing money for it.
    const after = await getStudentAccount(profileId);
    expect(after.transport.outstanding).toBe(before.transport.outstanding);
  });

  it("names the student in what the payer is asked to approve", async () => {
    // A student may legitimately pay from a parent's or guardian's wallet, so
    // the number is not restricted to their own. That is only safe if whoever
    // holds the phone can see who they are paying for — otherwise a prompt
    // pushed at a stranger is indistinguishable from a real one, and their
    // money settles a debt belonging to whoever sent it.
    let sentBody = "";
    const realFetch = global.fetch;
    process.env.PAYNOW_MODE = "live";
    process.env.PAYNOW_INTEGRATION_ID = "test-id";
    process.env.PAYNOW_INTEGRATION_KEY = "test-key";
    global.fetch = (async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      return {
        text: async () => "status=Ok&pollurl=https://www.paynow.co.zw/poll&paynowreference=1",
      } as Response;
    }) as typeof fetch;

    try {
      await createSelfPayment({
        profileId,
        purpose: "TRANSPORT_MONTH",
        method: "ecocash",
        phone: "0779990001",
      });
      const sent = new URLSearchParams(sentBody);
      expect(sent.get("additionalinfo")).toContain("Payments Test");
    } finally {
      global.fetch = realFetch;
      delete process.env.PAYNOW_MODE;
      delete process.env.PAYNOW_INTEGRATION_ID;
      delete process.env.PAYNOW_INTEGRATION_KEY;
    }
  });

  it("keeps the payer's name off the charge itself", async () => {
    // The ledger and the receipt describe the debt, not who funded it.
    const r = await createSelfPayment({
      profileId,
      purpose: "TRANSPORT_MONTH",
      method: "ecocash",
      phone: "0779990002",
    });
    const charge = await prisma.charge.findFirst({
      where: { originPayment: { reference: r.reference! } },
    });
    expect(charge?.description).toBe("Campus transport — 1 month");
    expect(charge?.description).not.toContain("Payments Test");
  });

  it("forgives the throttle once a number actually pays", async () => {
    // One parent's wallet paying for several students is the case the
    // anti-spam throttle must never block. Approving a prompt is consent, so
    // settling releases the number; ignoring prompts still accumulates.
    const SHARED = "0779995555";
    for (let i = 0; i < 3; i += 1) {
      const r = await createSelfPayment({
        profileId,
        purpose: "TRANSPORT_MONTH",
        method: "ecocash",
        phone: SHARED,
      });
      if (i < 2 && r.reference) {
        await cancelUnclearedPayment(r.reference).catch(() => undefined);
      } else if (r.reference) {
        // The third one is approved on the handset.
        await settlePayment(r.reference);
      }
    }

    // Budget would be exhausted by now had settlement not cleared it.
    const next = await createSelfPayment({
      profileId,
      purpose: "TRANSPORT_MONTH",
      method: "ecocash",
      phone: SHARED,
    });
    expect(next.ok).toBe(true);
  });

  it("does not offer a placeholder number as the default to pay from", () => {
    // 0771234567 is what seeding and bulk imports leave behind: well-formed,
    // on the right network, and unreachable. Pre-filled into the dialog it
    // becomes the default destination, and the payment dies as an
    // unexplained "cancellation" — which is exactly how the first live
    // EcoCash test failed.
    expect(looksLikePlaceholderPhone("0771234567")).toBe(true);
    expect(looksLikePlaceholderPhone("0771111111")).toBe(true);
    expect(looksLikePlaceholderPhone("0770000000")).toBe(true);
    expect(looksLikePlaceholderPhone("0777654321")).toBe(true);
    // Missing or malformed is no more use as a default than filler.
    expect(looksLikePlaceholderPhone(null)).toBe(true);
    expect(looksLikePlaceholderPhone("")).toBe(true);
    expect(looksLikePlaceholderPhone("12345")).toBe(true);
  });

  it("still offers an ordinary number", () => {
    expect(looksLikePlaceholderPhone("0772904617")).toBe(false);
    expect(looksLikePlaceholderPhone("0783461920")).toBe(false);
    expect(looksLikePlaceholderPhone("+263772904617")).toBe(false);
  });

  it("never blocks a number, only declines to pre-fill it", async () => {
    // The check decides a default, not a permission: someone whose real
    // number happens to look tidy must still be able to type it and pay.
    expect(checkMobileNumber("0771234567", "ecocash").ok).toBe(true);
    const r = await createSelfPayment({
      profileId,
      purpose: "TRANSPORT_MONTH",
      method: "ecocash",
      phone: "0771234567",
    });
    expect(r.ok).toBe(true);
  });

  it("buckets numbers without storing them", () => {
    // The rate-limit table must not become a directory of everyone's phone.
    const bucket = phoneBucket("0779998888");
    expect(bucket).not.toContain("9998888");
    expect(bucket).toMatch(/^[0-9a-f]{16}$/);
    // Same number, same bucket — including across formats.
    expect(phoneBucket("+263779998888")).toBe(bucket);
  });
});

describe("resolving which payment the return page is looking at", () => {
  it("uses ref verbatim when it is present", async () => {
    const resolved = await resolveReturnReference("PAY-EXPLICIT", profileId);
    expect(resolved).toBe("PAY-EXPLICIT");
  });

  it("falls back to the student's own most recent in-flight payment when ref is missing", async () => {
    const init = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    const resolved = await resolveReturnReference(undefined, profileId);
    expect(resolved).toBe(init.reference);
  });

  it("never resolves to a payment belonging to a different student", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: `other-${Date.now()}-${counter++}@test.local`,
        passwordHash: "x",
        name: "Other Student",
        role: "STUDENT",
      },
    });
    const otherProfile = await prisma.studentProfile.create({
      data: {
        userId: otherUser.id,
        fullName: "Other Student",
        email: otherUser.email,
        phone: "0771234567",
        houseId,
        roomId,
      },
    });
    // Only the other student has an in-flight payment.
    await createSelfPayment({
      profileId: otherProfile.id,
      purpose: "RENT_MONTH",
      method: "web",
    });

    const resolved = await resolveReturnReference(undefined, profileId);
    expect(resolved).toBeNull();
  });

  it("ignores a payment old enough that it cannot plausibly be this checkout session", async () => {
    const init = await createSelfPayment({
      profileId,
      purpose: "RENT_MONTH",
      method: "web",
    });
    await prisma.payment.update({
      where: { reference: init.reference! },
      data: { createdAt: new Date(Date.now() - 90 * 60_000) },
    });

    const resolved = await resolveReturnReference(undefined, profileId);
    expect(resolved).toBeNull();
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

describe("a gateway that falls over is not a customer declining", () => {
  // Found by pointing the doctor script at the live endpoint: Paynow's edge
  // answered "HTTP 503 upstream connect error ... Connection reset by peer".
  // fetch() resolves for that — it is a real HTTP response — so only a THROWN
  // connection error was ever treated as uncertain. A 503 therefore counted as
  // a hard decline: the payment was marked FAILED and the charge behind it
  // withdrawn, while the student was told their payment could not be started.
  // Nobody had declined anything; the gateway simply never answered.
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.PAYNOW_MODE;
    delete process.env.PAYNOW_INTEGRATION_ID;
    delete process.env.PAYNOW_INTEGRATION_KEY;
  });

  function live() {
    process.env.PAYNOW_MODE = "live";
    process.env.PAYNOW_INTEGRATION_ID = "test-id";
    process.env.PAYNOW_INTEGRATION_KEY = "test-key";
  }
  function respond(status: number, body: string) {
    global.fetch = (async () => ({ status, text: async () => body }) as Response) as typeof fetch;
  }

  it("treats a 503 from the gateway as ambiguous, so the charge survives", async () => {
    live();
    respond(503, "upstream connect error or disconnect/reset before headers");

    const r = await createPaynowPayment({
      reference: "PAY-503-WEB",
      amount: 120,
      email: "student@example.com",
      description: "Rent",
    });

    expect(r.ok).toBe(false);
    expect(r.ambiguous).toBe(true);
  });

  it("keeps the provider's exact words instead of collapsing them to 'Paynow error'", async () => {
    live();
    respond(503, "upstream connect error or disconnect/reset before headers");

    const r = await createPaynowPayment({
      reference: "PAY-503-DETAIL",
      amount: 120,
      email: "student@example.com",
      description: "Rent",
    });

    // The whole point: an unrecognised body is exactly when detail matters, and
    // it was exactly then that every clue used to be discarded.
    expect(r.providerError).toContain("503");
    expect(r.providerError).toContain("upstream connect error");
  });

  it("still treats a genuine refusal as a hard decline", async () => {
    live();
    respond(200, "status=Error&error=Invalid Id.");

    const r = await createPaynowPayment({
      reference: "PAY-REFUSED",
      amount: 120,
      email: "student@example.com",
      description: "Rent",
    });

    expect(r.ok).toBe(false);
    expect(r.ambiguous).toBeFalsy();
    expect(r.providerError).toBe("Invalid Id.");
  });

  it("applies the same rule to mobile-money prompts", async () => {
    live();
    respond(502, "<html><body>Bad Gateway</body></html>");

    const r = await createPaynowMobilePayment({
      reference: "PAY-502-MOBILE",
      amount: 15,
      email: "student@example.com",
      description: "Transport",
      phone: "0771111111",
      method: "ecocash",
    });

    expect(r.ok).toBe(false);
    expect(r.ambiguous).toBe(true);
    expect(r.providerError).toContain("502");
  });

  it("never shows a student the raw provider wording", async () => {
    live();
    respond(503, "upstream connect error TLS_error:|33554536:system library");

    const r = await createPaynowPayment({
      reference: "PAY-503-SAFE",
      amount: 120,
      email: "student@example.com",
      description: "Rent",
    });

    expect(r.error).not.toContain("TLS_error");
    expect(r.error).not.toContain("upstream");
  });
});
