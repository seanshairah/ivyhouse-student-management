import { describe, it, expect } from "vitest";
import { isUnusableFrom } from "@/services/email";

/**
 * A from-address on a reserved domain is refused by the provider, and the
 * failure is silent from the user's side: password resets and receipts simply
 * never arrive. Production once ran for weeks on `ivyhouse.local`, so this
 * guard is what stops a single wrong environment variable doing it again.
 */
describe("isUnusableFrom", () => {
  it("rejects the reserved domains that can never deliver", () => {
    for (const from of [
      "Ivy House <noreply@ivyhouse.local>",
      "noreply@ivyhouse.local",
      "a@b.localhost",
      "a@b.invalid",
      "a@b.test",
      "a@b.example",
      "a@b.internal",
    ]) {
      expect(isUnusableFrom(from), from).toBe(true);
    }
  });

  it("rejects malformed addresses", () => {
    for (const from of ["not-an-address", "@missing-local.com", "no-at-sign.com", ""]) {
      expect(isUnusableFrom(from), from).toBe(true);
    }
  });

  it("accepts real sending addresses, with or without a display name", () => {
    for (const from of [
      "Ivy Properties <notifications@ivyproperties.co.zw>",
      "notifications@blessbriproperties.co.zw",
      "Support <help@example.co.uk>",
    ]) {
      expect(isUnusableFrom(from), from).toBe(false);
    }
  });

  it("is case-insensitive", () => {
    expect(isUnusableFrom("A@B.LOCAL")).toBe(true);
    expect(isUnusableFrom("Notifications@IvyProperties.CO.ZW")).toBe(false);
  });
});
