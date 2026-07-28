import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, ChargeCategory, PaymentStatus } from "@prisma/client";
import {
  canAccessInvoice,
  canAccessReceipt,
  canAccessPayment,
  canAccessStudent,
} from "@/core/auth/access";
import { rateLimit, clearRateLimit } from "@/core/auth/rate-limit";
import {
  createPasswordReset,
  redeemPasswordReset,
} from "@/core/auth/password-reset";
import { verifyPaynowHash } from "@/services/payments/paynow";
import { verifyPassword } from "@/lib/auth";
import crypto from "crypto";

const prisma = new PrismaClient();

let houseId: string;
let alice: { userId: string; profileId: string };
let mallory: { userId: string; profileId: string };
let ownerUserId: string;
let counter = 0;

async function makeStudent(label: string) {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${Date.now()}-${counter++}@test.local`,
      passwordHash: "x",
      name: label,
      role: "STUDENT",
    },
  });
  const profile = await prisma.studentProfile.create({
    data: {
      userId: user.id,
      fullName: label,
      email: user.email,
      phone: "0770000000",
      houseId,
    },
  });
  return { userId: user.id, profileId: profile.id };
}

beforeAll(async () => {
  const house = await prisma.house.create({
    data: {
      name: `Security Test House ${Date.now()}`,
      slug: `security-test-${Date.now()}`,
      description: "Fixture",
      location: "Test",
      amenities: [],
      services: [],
      rules: [],
      safetyInfo: [],
    },
  });
  houseId = house.id;
  const owner = await prisma.user.create({
    data: {
      email: `owner-${Date.now()}@test.local`,
      passwordHash: "x",
      name: "Owner",
      role: "OWNER",
    },
  });
  ownerUserId = owner.id;
});

beforeEach(async () => {
  alice = await makeStudent("alice");
  mallory = await makeStudent("mallory");
});

afterAll(async () => {
  await prisma.house.deleteMany({ where: { id: houseId } });
  await prisma.$disconnect();
});

describe("one student cannot reach another student's records", () => {
  it("blocks reading someone else's invoice", async () => {
    const invoice = await prisma.invoice.create({
      data: {
        number: `INV-SEC-${Date.now()}-${counter++}`,
        studentProfileId: alice.profileId,
        description: "Rent",
        amount: 120,
      },
    });

    expect(
      await canAccessInvoice({ userId: alice.userId, role: "STUDENT" }, invoice.id),
    ).toBe(true);
    // The bug this covers: any signed-in student could fetch this by id.
    expect(
      await canAccessInvoice({ userId: mallory.userId, role: "STUDENT" }, invoice.id),
    ).toBe(false);
  });

  it("blocks reading someone else's receipt", async () => {
    const payment = await prisma.payment.create({
      data: {
        reference: `SEC-${Date.now()}-${counter++}`,
        studentProfileId: alice.profileId,
        amount: 120,
        category: ChargeCategory.RENT,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      },
    });
    const receipt = await prisma.receipt.create({
      data: {
        number: `RCT-SEC-${Date.now()}-${counter++}`,
        paymentId: payment.id,
        amount: 120,
      },
    });

    expect(
      await canAccessReceipt({ userId: alice.userId, role: "STUDENT" }, receipt.id),
    ).toBe(true);
    expect(
      await canAccessReceipt({ userId: mallory.userId, role: "STUDENT" }, receipt.id),
    ).toBe(false);
  });

  it("blocks acting on someone else's payment", async () => {
    const payment = await prisma.payment.create({
      data: {
        reference: `SEC-PAY-${Date.now()}-${counter++}`,
        studentProfileId: alice.profileId,
        amount: 120,
        category: ChargeCategory.RENT,
      },
    });

    expect(
      await canAccessPayment({ userId: alice.userId, role: "STUDENT" }, payment.reference),
    ).toBe(true);
    expect(
      await canAccessPayment({ userId: mallory.userId, role: "STUDENT" }, payment.reference),
    ).toBe(false);
  });

  it("blocks reading someone else's account statement", async () => {
    // The statement route's id IS the studentProfileId — a whole account history.
    expect(
      await canAccessStudent({ userId: mallory.userId, role: "STUDENT" }, alice.profileId),
    ).toBe(false);
    expect(
      await canAccessStudent({ userId: alice.userId, role: "STUDENT" }, alice.profileId),
    ).toBe(true);
  });

  it("lets staff read any record in their own database", async () => {
    const invoice = await prisma.invoice.create({
      data: {
        number: `INV-SEC-${Date.now()}-${counter++}`,
        studentProfileId: alice.profileId,
        description: "Rent",
        amount: 120,
      },
    });
    expect(
      await canAccessInvoice({ userId: ownerUserId, role: "OWNER" }, invoice.id),
    ).toBe(true);
    expect(
      await canAccessStudent({ userId: ownerUserId, role: "OWNER" }, alice.profileId),
    ).toBe(true);
  });

  it("denies access to a record that does not exist", async () => {
    expect(
      await canAccessInvoice({ userId: alice.userId, role: "STUDENT" }, "no-such-id"),
    ).toBe(false);
  });
});

describe("rate limiting", () => {
  it("blocks once the window is exhausted, and reports a retry delay", async () => {
    const key = `test:${Date.now()}-${counter++}`;
    for (let i = 0; i < 3; i++) {
      const r = await rateLimit({ key, limit: 3, windowSeconds: 60 });
      expect(r.allowed).toBe(true);
    }

    const blocked = await rateLimit({ key, limit: 3, windowSeconds: 60 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps buckets independent", async () => {
    const a = `test-a:${Date.now()}-${counter++}`;
    const b = `test-b:${Date.now()}-${counter++}`;
    await rateLimit({ key: a, limit: 1, windowSeconds: 60 });
    expect((await rateLimit({ key: a, limit: 1, windowSeconds: 60 })).allowed).toBe(false);
    // Exhausting one email's bucket must not lock out everybody else.
    expect((await rateLimit({ key: b, limit: 1, windowSeconds: 60 })).allowed).toBe(true);
  });

  it("frees the bucket after a successful sign-in", async () => {
    const key = `test-clear:${Date.now()}-${counter++}`;
    await rateLimit({ key, limit: 1, windowSeconds: 60 });
    expect((await rateLimit({ key, limit: 1, windowSeconds: 60 })).allowed).toBe(false);

    await clearRateLimit(key);
    expect((await rateLimit({ key, limit: 1, windowSeconds: 60 })).allowed).toBe(true);
  });
});

describe("password reset", () => {
  it("issues a token that sets the password once", async () => {
    const user = await prisma.user.findUnique({ where: { id: alice.userId } });
    const request = await createPasswordReset(user!.email);
    expect(request.token).toBeTruthy();

    const result = await redeemPasswordReset(request.token!, "a-new-password");
    expect(result.ok).toBe(true);

    const updated = await prisma.user.findUnique({ where: { id: alice.userId } });
    expect(await verifyPassword("a-new-password", updated!.passwordHash)).toBe(true);
    // Having just chosen a password, they must not be sent to the forced-change screen.
    expect(updated!.mustChangePassword).toBe(false);
  });

  it("refuses to reuse a token", async () => {
    const user = await prisma.user.findUnique({ where: { id: alice.userId } });
    const request = await createPasswordReset(user!.email);

    expect((await redeemPasswordReset(request.token!, "first-password")).ok).toBe(true);
    const replay = await redeemPasswordReset(request.token!, "attacker-password");
    expect(replay.ok).toBe(false);

    // The replay must not have changed anything.
    const updated = await prisma.user.findUnique({ where: { id: alice.userId } });
    expect(await verifyPassword("first-password", updated!.passwordHash)).toBe(true);
  });

  it("invalidates an older token when a new one is requested", async () => {
    const user = await prisma.user.findUnique({ where: { id: alice.userId } });
    const first = await createPasswordReset(user!.email);
    const second = await createPasswordReset(user!.email);

    expect((await redeemPasswordReset(first.token!, "from-old-link")).ok).toBe(false);
    expect((await redeemPasswordReset(second.token!, "from-new-link")).ok).toBe(true);
  });

  it("rejects an expired token", async () => {
    const user = await prisma.user.findUnique({ where: { id: alice.userId } });
    const request = await createPasswordReset(user!.email);

    await prisma.passwordResetToken.updateMany({
      where: { userId: alice.userId, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await redeemPasswordReset(request.token!, "too-late")).ok).toBe(false);
  });

  it("rejects a made-up token", async () => {
    expect((await redeemPasswordReset("not-a-real-token", "whatever")).ok).toBe(false);
  });

  it("reveals nothing when the email is not registered", async () => {
    const request = await createPasswordReset("nobody@nowhere.test");
    expect(request.token).toBeNull();
  });

  it("stores only the hash of the token", async () => {
    const user = await prisma.user.findUnique({ where: { id: alice.userId } });
    const request = await createPasswordReset(user!.email);

    const stored = await prisma.passwordResetToken.findFirst({
      where: { userId: alice.userId, usedAt: null },
    });
    // A database leak must not hand over working reset links.
    expect(stored!.tokenHash).not.toBe(request.token);
    expect(stored!.tokenHash).toBe(
      crypto.createHash("sha256").update(request.token!).digest("hex"),
    );
  });
});

describe("Paynow inbound signature", () => {
  const KEY = "test-integration-key";

  function sign(fields: Record<string, string>): string {
    const concat = Object.values(fields).join("") + KEY;
    return crypto.createHash("sha512").update(concat).digest("hex").toUpperCase();
  }

  it("accepts a correctly signed payload", () => {
    const fields = { reference: "PAY-1", amount: "120.00", status: "Paid" };
    const payload = { ...fields, hash: sign(fields) };
    expect(verifyPaynowHash(payload, KEY)).toBe("valid");
  });

  it("rejects a payload whose status was tampered with", () => {
    const fields = { reference: "PAY-1", amount: "120.00", status: "Cancelled" };
    const payload = { ...fields, hash: sign(fields) };
    // An attacker flips the status but cannot recompute the hash without the key.
    payload.status = "Paid";
    expect(verifyPaynowHash(payload, KEY)).toBe("invalid");
  });

  it("rejects a payload signed with the wrong key", () => {
    const fields = { reference: "PAY-1", status: "Paid" };
    const payload = { ...fields, hash: sign(fields) };
    expect(verifyPaynowHash(payload, "someone-elses-key")).toBe("invalid");
  });

  it("reports an unsigned payload as absent rather than valid", () => {
    expect(verifyPaynowHash({ reference: "PAY-1", status: "Paid" }, KEY)).toBe("absent");
  });
});
