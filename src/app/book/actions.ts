"use server";

import { bookingSchema, type BookingInput } from "@/lib/validators";
import { submitApplication } from "@/services/applications";

export interface BookingActionResult {
  success: boolean;
  reference?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** Coerce "" / null / undefined to undefined for optional fields. */
function clean(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

export async function submitApplicationAction(
  values: BookingInput,
): Promise<BookingActionResult> {
  const parsed = bookingSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      success: false,
      error: "Please check the highlighted fields and try again.",
      fieldErrors,
    };
  }

  const data = parsed.data;

  try {
    const application = await submitApplication({
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      nationalId: clean(data.nationalId),
      age: data.age,
      gender: clean(data.gender),
      institution: clean(data.institution),
      program: clean(data.program),
      yearOfStudy: clean(data.yearOfStudy),
      houseId: data.houseId,
      roomId: clean(data.roomId),
      nextOfKinName: clean(data.nextOfKinName),
      nextOfKinPhone: clean(data.nextOfKinPhone),
      nextOfKinRelation: clean(data.nextOfKinRelation),
      guardianName: clean(data.guardianName),
      guardianPhone: clean(data.guardianPhone),
      specialNotes: clean(data.specialNotes),
      medicalNeeds: clean(data.medicalNeeds),
      agreedToTerms: data.agreedToTerms,
    });

    return { success: true, reference: application.reference };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Something went wrong.";
    // The service throws a friendly message when a room was just taken — surface it.
    if (/just been taken/i.test(message)) {
      return {
        success: false,
        error:
          "Sorry, that room has just been taken. Please go back and choose another available room.",
      };
    }
    return {
      success: false,
      error:
        "We couldn't submit your application right now. Please try again in a moment.",
    };
  }
}
