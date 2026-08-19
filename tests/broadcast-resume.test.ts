import { describe, it, expect, beforeEach } from "vitest";
import { NotificationChannel, MessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/services/messaging";

/**
 * A house-wide broadcast does not always finish in one request. Re-running it
 * must resume rather than message the first half twice — including when the
 * same person is stored under a differently formatted phone number.
 */
const BODY = "Portal reminder — resume test";

const recipients = [
  { name: "Alpha One", email: "alpha@example.com", phone: "0771111111" },
  { name: "Bravo Two", email: "bravo@example.com", phone: "0772222222" },
];

describe("sendMessage — resuming an interrupted broadcast", () => {
  beforeEach(async () => {
    await prisma.messageLog.deleteMany({ where: { body: BODY } });
  });

  it("skips recipients who already received the exact message", async () => {
    const first = await sendMessage({
      channels: [NotificationChannel.SMS],
      recipients: [recipients[0]],
      body: BODY,
      skipAlreadySent: true,
    });
    expect(first.smsSent).toBe(1);

    // The interrupted run is retried with the FULL list.
    const second = await sendMessage({
      channels: [NotificationChannel.SMS],
      recipients,
      body: BODY,
      skipAlreadySent: true,
    });
    expect(second.smsSent).toBe(1); // only the one who missed out
    expect(second.skipped).toBe(1); // the one already reached
  });

  it("matches the same person across phone-number formats", async () => {
    await sendMessage({
      channels: [NotificationChannel.SMS],
      recipients: [{ ...recipients[0], phone: "+263 77 111 1111" }],
      body: BODY,
      skipAlreadySent: true,
    });
    const again = await sendMessage({
      channels: [NotificationChannel.SMS],
      recipients: [{ ...recipients[0], phone: "0771111111" }],
      body: BODY,
      skipAlreadySent: true,
    });
    expect(again.smsSent).toBe(0);
    expect(again.skipped).toBe(1);
  });

  it("still repeats when the sender explicitly asks for it", async () => {
    await sendMessage({
      channels: [NotificationChannel.SMS],
      recipients: [recipients[0]],
      body: BODY,
      skipAlreadySent: true,
    });
    const forced = await sendMessage({
      channels: [NotificationChannel.SMS],
      recipients: [recipients[0]],
      body: BODY,
    });
    expect(forced.smsSent).toBe(1);
  });

  it("does not treat a different message as already sent", async () => {
    await sendMessage({
      channels: [NotificationChannel.SMS],
      recipients: [recipients[0]],
      body: BODY,
      skipAlreadySent: true,
    });
    const other = await sendMessage({
      channels: [NotificationChannel.SMS],
      recipients: [recipients[0]],
      body: BODY + " (different)",
      skipAlreadySent: true,
    });
    expect(other.smsSent).toBe(1);
    expect(other.skipped).toBe(0);
    await prisma.messageLog.deleteMany({ where: { body: BODY + " (different)" } });
  });
});
