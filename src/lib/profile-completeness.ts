/**
 * Which of a student's own details are still missing.
 *
 * Returning students were placed straight into rooms by the roster import, so
 * they never passed through the onboarding form that normally collects an
 * emergency contact — most arrive with no next of kin on file. These are the
 * fields a student can fill in themselves at {@link PROFILE_COMPLETION_PATH},
 * so the dashboard can flag them and point the student there.
 *
 * Owner-managed fields (programme, ID number, year of study…) are deliberately
 * NOT listed: there is nowhere for the student to add them, so nagging about
 * them would send the student to a page that can't fix the gap.
 */

export interface ProfileCompletenessInput {
  nextOfKinName?: string | null;
  nextOfKinPhone?: string | null;
  nextOfKinRelation?: string | null;
}

const isBlank = (value?: string | null): boolean => !value || value.trim() === "";

/** Human-readable labels for the student-editable details still blank. */
export function missingProfileFields(
  profile: ProfileCompletenessInput | null | undefined,
): string[] {
  if (!profile) return [];
  const missing: string[] = [];
  if (isBlank(profile.nextOfKinName)) missing.push("Next of kin name");
  if (isBlank(profile.nextOfKinPhone)) missing.push("Next of kin phone number");
  if (isBlank(profile.nextOfKinRelation)) missing.push("Next of kin relationship");
  return missing;
}

/** The page where a student completes the details above. */
export const PROFILE_COMPLETION_PATH = "/student/profile";
