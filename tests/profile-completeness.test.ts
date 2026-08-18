import { describe, it, expect } from "vitest";
import { missingProfileFields } from "@/lib/profile-completeness";

/**
 * The dashboard banner keys off this list, so it must name every blank
 * next-of-kin field, treat whitespace as blank, and stay silent once the
 * emergency contact is complete (or when there is no profile at all).
 */
describe("missingProfileFields", () => {
  it("lists every blank next-of-kin field", () => {
    expect(missingProfileFields({})).toEqual([
      "Next of kin name",
      "Next of kin phone number",
      "Next of kin relationship",
    ]);
  });

  it("treats whitespace-only values as blank", () => {
    expect(
      missingProfileFields({
        nextOfKinName: "  ",
        nextOfKinPhone: "0771234567",
        nextOfKinRelation: "Mother",
      }),
    ).toEqual(["Next of kin name"]);
  });

  it("returns nothing when the emergency contact is complete", () => {
    expect(
      missingProfileFields({
        nextOfKinName: "Jane Doe",
        nextOfKinPhone: "0771234567",
        nextOfKinRelation: "Mother",
      }),
    ).toEqual([]);
  });

  it("returns nothing for a null or absent profile", () => {
    expect(missingProfileFields(null)).toEqual([]);
    expect(missingProfileFields(undefined)).toEqual([]);
  });
});
