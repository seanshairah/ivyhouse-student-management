import { prisma } from "@/lib/prisma";
import {
  ApplicationStatus,
  ApplicationType,
  RoomStatus,
  StudentStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";
import { generateReference, formatCurrency, generateTempPassword } from "@/lib/utils";
import { hashPassword } from "@/lib/auth";
import { sendTemplatedEmail } from "@/services/email";
import { sendStatusSMS } from "@/services/sms";
import { notifyOwners, notifyDashboard } from "@/services/notifications";
import { createInvoice } from "@/services/invoices";
import { generatePaymentLink } from "@/services/payments";
import { getSettings } from "@/services/numbering";
import { EMAIL_SUBJECTS } from "@/constants/messages";
import { audit } from "@/services/audit";

export interface SubmitApplicationInput {
  fullName: string;
  email: string;
  phone: string;
  nationalId?: string;
  age?: number;
  gender?: string;
  institution?: string;
  program?: string;
  yearOfStudy?: string;
  houseId: string;
  roomId?: string;
  nextOfKinName?: string;
  nextOfKinPhone?: string;
  nextOfKinRelation?: string;
  guardianName?: string;
  guardianPhone?: string;
  specialNotes?: string;
  medicalNeeds?: string;
  agreedToTerms: boolean;
}

/**
 * Submit a public booking application.
 * Uses a transaction with server-side checks to prevent double-booking:
 * the selected room is re-read inside the transaction and only reserved if
 * still available.
 */
export async function submitApplication(input: SubmitApplicationInput) {
  const reference = generateReference("APP");

  const application = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // Validate & lock the room if one was chosen.
      if (input.roomId) {
        const room = await tx.room.findUnique({ where: { id: input.roomId } });
        if (!room) throw new Error("Selected room not found");
        if (room.houseId !== input.houseId)
          throw new Error("Room does not belong to the selected house");
        if (
          room.status !== RoomStatus.AVAILABLE ||
          room.occupied >= room.capacity
        ) {
          throw new Error(
            "Sorry, that room has just been taken. Please choose another room.",
          );
        }
        // Reserve: mark Pending Application.
        await tx.room.update({
          where: { id: room.id },
          data: { status: RoomStatus.PENDING_APPLICATION },
        });
      }

      return tx.application.create({
        data: {
          reference,
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          nationalId: input.nationalId,
          age: input.age,
          gender: input.gender,
          institution: input.institution,
          program: input.program,
          yearOfStudy: input.yearOfStudy,
          houseId: input.houseId,
          roomId: input.roomId,
          nextOfKinName: input.nextOfKinName,
          nextOfKinPhone: input.nextOfKinPhone,
          nextOfKinRelation: input.nextOfKinRelation,
          guardianName: input.guardianName,
          guardianPhone: input.guardianPhone,
          specialNotes: input.specialNotes,
          medicalNeeds: input.medicalNeeds,
          agreedToTerms: input.agreedToTerms,
          status: ApplicationStatus.AWAITING_REVIEW,
        },
        include: { house: true, room: true },
      });
    },
  );

  // ── Notifications (best-effort) ──
  const portalUrl = `${process.env.APP_URL || ""}/auth/login`;
  await sendTemplatedEmail(
    application.email,
    EMAIL_SUBJECTS.applicationReceived,
    "applicationReceived",
    {
      studentName: application.fullName,
      houseName: application.house.name,
      roomName: application.room?.number ?? "To be assigned",
      reference: application.reference,
      portalUrl,
    },
  ).catch(() => undefined);

  await sendStatusSMS(application.phone, "applicationReceived", {
    studentName: application.fullName,
    houseName: application.house.name,
  }).catch(() => undefined);

  const settings = await getSettings();
  await sendTemplatedEmail(
    settings.ownerEmail,
    EMAIL_SUBJECTS.newApplicationAlert,
    "newApplicationAlert",
    {
      studentName: application.fullName,
      email: application.email,
      phone: application.phone,
      houseName: application.house.name,
      roomName: application.room?.number ?? "—",
      reference: application.reference,
      reviewUrl: `${process.env.APP_URL || ""}/owner/applications/${application.id}`,
    },
  ).catch(() => undefined);

  await notifyOwners({
    title: "New application received",
    body: `${application.fullName} applied for ${application.house.name}${
      application.room ? ` (Room ${application.room.number})` : ""
    }.`,
    type: "application",
    link: `/owner/applications/${application.id}`,
    relatedType: "Application",
    relatedId: application.id,
  }).catch(() => undefined);

  await audit({
    actorEmail: application.email,
    action: "application.submitted",
    entityType: "Application",
    entityId: application.id,
    metadata: { reference, house: application.house.name },
  });

  return application;
}

export interface RenewalInput {
  studentProfileId: string;
  roomId: string; // the student's current room, or a different available room
  requestedTerm: string;
  notes?: string;
}

/**
 * Request to renew / extend a stay for the coming term. An existing student
 * re-applies — it flows through the same owner approval workflow as a new
 * booking. If a different room is requested it must be available and is held.
 */
export async function requestRenewal(input: RenewalInput) {
  const reference = generateReference("RNW");
  const profile = await prisma.studentProfile.findUnique({
    where: { id: input.studentProfileId },
    include: { house: true, room: true, user: true },
  });
  if (!profile) throw new Error("Student profile not found");

  const application = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const room = await tx.room.findUnique({ where: { id: input.roomId } });
      if (!room) throw new Error("Selected room not found");

      const isCurrentRoom = profile.roomId === room.id;
      if (!isCurrentRoom) {
        // Moving to a different room — it must be free, and we hold it.
        if (
          room.status !== RoomStatus.AVAILABLE ||
          room.occupied >= room.capacity
        ) {
          throw new Error(
            "Sorry, that room is no longer available. Please choose another room.",
          );
        }
        await tx.room.update({
          where: { id: room.id },
          data: { status: RoomStatus.PENDING_APPLICATION },
        });
      }

      return tx.application.create({
        data: {
          reference,
          type: ApplicationType.RENEWAL,
          requestedTerm: input.requestedTerm,
          studentProfileId: profile.id,
          fullName: profile.fullName,
          email: profile.email,
          phone: profile.phone,
          nationalId: profile.nationalId,
          age: profile.age,
          gender: profile.gender,
          institution: profile.institution,
          program: profile.program,
          yearOfStudy: profile.yearOfStudy,
          houseId: room.houseId,
          roomId: room.id,
          nextOfKinName: profile.nextOfKinName,
          nextOfKinPhone: profile.nextOfKinPhone,
          nextOfKinRelation: profile.nextOfKinRelation,
          guardianName: profile.guardianName,
          guardianPhone: profile.guardianPhone,
          specialNotes: input.notes,
          agreedToTerms: true,
          status: ApplicationStatus.AWAITING_REVIEW,
        },
        include: { house: true, room: true },
      });
    },
  );

  await sendTemplatedEmail(
    profile.email,
    EMAIL_SUBJECTS.renewalReceived,
    "renewalReceived",
    {
      studentName: profile.fullName,
      houseName: application.house.name,
      roomName: application.room?.number ?? "—",
      term: input.requestedTerm,
      reference,
    },
  ).catch(() => undefined);

  await sendStatusSMS(profile.phone, "renewalReceived", {
    studentName: profile.fullName,
    houseName: application.house.name,
    term: input.requestedTerm,
  }).catch(() => undefined);

  await notifyOwners({
    title: "Renewal request received",
    body: `${profile.fullName} requested to renew their stay at ${application.house.name}${
      application.room ? ` (Room ${application.room.number})` : ""
    } for ${input.requestedTerm}.`,
    type: "application",
    link: `/owner/applications/${application.id}`,
    relatedType: "Application",
    relatedId: application.id,
  }).catch(() => undefined);

  if (profile.userId) {
    await notifyDashboard({
      userId: profile.userId,
      title: "Renewal request submitted",
      body: "Your renewal is awaiting review. We'll notify you by email and SMS.",
      type: "application",
      link: "/student/room",
      relatedType: "Application",
      relatedId: application.id,
    }).catch(() => undefined);
  }

  await audit({
    actorEmail: profile.email,
    action: "renewal.requested",
    entityType: "Application",
    entityId: application.id,
    metadata: { reference, term: input.requestedTerm },
  });

  return application;
}

/**
 * Ensure a student User + profile exists for an application (used on approval).
 * Provisions a fresh temporary password and returns it so login credentials can
 * be sent to the student. Returns `tempPassword: null` only if the student was
 * already onboarded with their own profile.
 */
async function ensureStudentProfile(
  applicationId: string,
  tx: Prisma.TransactionClient,
): Promise<{
  profile: Awaited<ReturnType<typeof tx.studentProfile.create>>;
  tempPassword: string | null;
}> {
  const app = await tx.application.findUnique({
    where: { id: applicationId },
  });
  if (!app) throw new Error("Application not found");
  if (app.studentProfileId) {
    const existing = await tx.studentProfile.findUnique({
      where: { id: app.studentProfileId },
    });
    if (existing) return { profile: existing, tempPassword: null };
  }

  // Generate fresh login credentials so the student can access their portal.
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  // Reuse an existing user by email (resetting their password), else create one.
  const existingUser = await tx.user.findUnique({ where: { email: app.email } });
  const user = existingUser
    ? await tx.user.update({
        where: { id: existingUser.id },
        data: { passwordHash, role: UserRole.STUDENT, isActive: true },
      })
    : await tx.user.create({
        data: {
          email: app.email,
          name: app.fullName,
          phone: app.phone,
          role: UserRole.STUDENT,
          passwordHash,
        },
      });

  const profile = await tx.studentProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      fullName: app.fullName,
      email: app.email,
      phone: app.phone,
      nationalId: app.nationalId,
      age: app.age,
      gender: app.gender,
      institution: app.institution,
      program: app.program,
      yearOfStudy: app.yearOfStudy,
      houseId: app.houseId,
      roomId: app.roomId,
      nextOfKinName: app.nextOfKinName,
      nextOfKinPhone: app.nextOfKinPhone,
      nextOfKinRelation: app.nextOfKinRelation,
      guardianName: app.guardianName,
      guardianPhone: app.guardianPhone,
      status: StudentStatus.APPLICANT,
    },
  });

  await tx.application.update({
    where: { id: applicationId },
    data: { studentProfileId: profile.id },
  });
  return { profile, tempPassword };
}

/**
 * Approve an application: create student, reserve room, create invoice,
 * generate payment link, and notify the student.
 */
export async function approveApplication(
  applicationId: string,
  options?: { actorId?: string; actorEmail?: string; roomId?: string; amount?: number },
) {
  const settings = await getSettings();

  const { application, invoiceId, tempPassword, isRenewal } =
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const app = await tx.application.findUnique({
        where: { id: applicationId },
        include: { house: true, room: true },
      });
      if (!app) throw new Error("Application not found");

      const isRenewal = app.type === ApplicationType.RENEWAL;
      const roomId = options?.roomId ?? app.roomId ?? undefined;
      if (!roomId) throw new Error("Assign a room before approving");

      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room) throw new Error("Room not found");

      const { profile, tempPassword } = await ensureStudentProfile(
        applicationId,
        tx,
      );
      if (!profile) throw new Error("Could not create student profile");

      // A renewal keeping the same room already occupies it — don't re-check
      // capacity or change its status. Any other case is a new occupant.
      const isCurrentRoom = isRenewal && profile.roomId === roomId;
      if (!isCurrentRoom) {
        if (room.occupied >= room.capacity) {
          throw new Error("Room is fully occupied");
        }
        if (
          room.status === RoomStatus.MAINTENANCE ||
          room.status === RoomStatus.UNAVAILABLE
        ) {
          throw new Error("Room is not available for assignment");
        }
        await tx.room.update({
          where: { id: roomId },
          data: { status: RoomStatus.RESERVED },
        });
      }

      if (!isRenewal) {
        // New student: assign the room and gate them to payment until paid.
        await tx.studentProfile.update({
          where: { id: profile.id },
          data: {
            roomId,
            houseId: app.houseId,
            status: StudentStatus.APPLICANT,
          },
        });
      }
      // For renewals the resident stays ACTIVE (keeps dashboard access); any
      // room change + lease extension is applied when payment settles.

      const amount = options?.amount ?? Number(room.price);
      const invoice = await createInvoice(
        {
          studentProfileId: profile.id,
          applicationId: app.id,
          description: isRenewal
            ? `Stay renewal — ${app.house.name}, Room ${room.number}${
                app.requestedTerm ? ` (${app.requestedTerm})` : ""
              }`
            : `Accommodation — ${app.house.name}, Room ${room.number}`,
          amount,
          dueInDays: settings.paymentTermsDays,
        },
        tx,
      );

      const updated = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.APPROVED,
          roomId,
          decidedAt: new Date(),
        },
        include: { house: true, room: true, studentProfile: true },
      });

      return {
        application: updated,
        invoiceId: invoice.id,
        amount,
        profile,
        tempPassword,
        isRenewal,
      };
    }, {
      // Password hashing + several round-trips over the pooled serverless
      // connection can approach Prisma's 5s default; give it headroom.
      maxWait: 10_000,
      timeout: 20_000,
    });

  // Generate the payment request + Paynow link, but suppress its own
  // notifications — the approval/credentials message below covers it.
  await generatePaymentLink(invoiceId, { notify: false });

  // Move application into payment-pending now that a link exists.
  await prisma.application.update({
    where: { id: applicationId },
    data: { status: ApplicationStatus.PAYMENT_PENDING },
  });

  const amountDue = application.room ? Number(application.room.price) : 0;
  const loginUrl = `${process.env.APP_URL || ""}/auth/login`;

  if (isRenewal) {
    // Existing resident — no new credentials, just "pay to confirm".
    await sendTemplatedEmail(
      application.email,
      EMAIL_SUBJECTS.renewalApproved,
      "renewalApproved",
      {
        studentName: application.fullName,
        houseName: application.house.name,
        roomName: application.room?.number ?? "—",
        term: application.requestedTerm ?? "the new term",
        amount: formatCurrency(amountDue),
        loginUrl,
      },
    ).catch(() => undefined);

    await sendStatusSMS(application.phone, "renewalApproved", {
      studentName: application.fullName,
      houseName: application.house.name,
      term: application.requestedTerm ?? "the new term",
      amount: formatCurrency(amountDue),
    }).catch(() => undefined);
  } else {
    // New student — send auto-generated login credentials + rent instructions.
    await sendTemplatedEmail(
      application.email,
      EMAIL_SUBJECTS.applicationApproved,
      "applicationApproved",
      {
        studentName: application.fullName,
        houseName: application.house.name,
        roomName: application.room?.number ?? "—",
        amount: formatCurrency(amountDue),
        email: application.email,
        password: tempPassword ?? "(use your existing password)",
        loginUrl,
      },
    ).catch(() => undefined);

    await sendStatusSMS(application.phone, "applicationApproved", {
      studentName: application.fullName,
      houseName: application.house.name,
      email: application.email,
      password: tempPassword ?? "your existing password",
      loginUrl,
    }).catch(() => undefined);
  }

  if (application.studentProfile?.userId) {
    await notifyDashboard({
      userId: application.studentProfile.userId,
      title: isRenewal ? "Renewal approved 🎉" : "Application approved 🎉",
      body: isRenewal
        ? "Pay to confirm your room for the new term."
        : "Pay your rent to activate your account and unlock your dashboard.",
      type: "application",
      link: "/student/payments",
      relatedType: "Application",
      relatedId: applicationId,
    }).catch(() => undefined);
  }

  await audit({
    userId: options?.actorId,
    actorEmail: options?.actorEmail,
    action: "application.approved",
    entityType: "Application",
    entityId: applicationId,
  });

  return application;
}

/** Reject an application: free the room and notify the applicant politely. */
export async function rejectApplication(
  applicationId: string,
  options?: { actorId?: string; actorEmail?: string; reason?: string },
) {
  const application = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const app = await tx.application.findUnique({
        where: { id: applicationId },
        include: { house: true, room: true },
      });
      if (!app) throw new Error("Application not found");

      // Release a pending/reserved room back to available.
      if (
        app.roomId &&
        app.room &&
        (app.room.status === RoomStatus.PENDING_APPLICATION ||
          app.room.status === RoomStatus.RESERVED)
      ) {
        await tx.room.update({
          where: { id: app.roomId },
          data: { status: RoomStatus.AVAILABLE },
        });
      }

      return tx.application.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.REJECTED,
          reviewNotes: options?.reason,
          decidedAt: new Date(),
        },
        include: { house: true },
      });
    },
  );

  await sendTemplatedEmail(
    application.email,
    EMAIL_SUBJECTS.applicationRejected,
    "applicationRejected",
    {
      studentName: application.fullName,
      houseName: application.house.name,
      reason: options?.reason ?? "",
    },
  ).catch(() => undefined);

  await sendStatusSMS(application.phone, "applicationRejected", {
    studentName: application.fullName,
    houseName: application.house.name,
  }).catch(() => undefined);

  await audit({
    userId: options?.actorId,
    actorEmail: options?.actorEmail,
    action: "application.rejected",
    entityType: "Application",
    entityId: applicationId,
    metadata: { reason: options?.reason },
  });

  return application;
}

/** Confirm move-in after payment: room becomes Occupied. */
export async function confirmMoveIn(applicationId: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const app = await tx.application.findUnique({
      where: { id: applicationId },
    });
    if (!app || !app.roomId || !app.studentProfileId)
      throw new Error("Application not ready for move-in");

    const room = await tx.room.findUnique({ where: { id: app.roomId } });
    if (!room) throw new Error("Room not found");

    const nextOccupied = room.occupied + 1;
    await tx.room.update({
      where: { id: app.roomId },
      data: {
        occupied: nextOccupied,
        // Stay RESERVED while there's still capacity (it's spoken for), only
        // OCCUPIED once full. Never flip back to AVAILABLE — that would allow
        // the public form to double-book the room.
        status:
          nextOccupied >= room.capacity
            ? RoomStatus.OCCUPIED
            : RoomStatus.RESERVED,
      },
    });
    await tx.studentProfile.update({
      where: { id: app.studentProfileId },
      data: { status: StudentStatus.ACTIVE, moveInDate: new Date() },
    });
    return tx.application.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.MOVED_IN },
    });
  });
}
