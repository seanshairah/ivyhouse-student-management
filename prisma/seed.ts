import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedHouses } from "../src/data/houses";

const prisma = new PrismaClient();

function ref(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

async function main() {
  console.log("🌱 Seeding database...");

  // ── Clean (order matters for FKs) ──
  await prisma.receipt.deleteMany();
  await prisma.paymentTransaction.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.statement.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.application.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.messageLog.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.smsLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.caretaker.deleteMany();
  await prisma.room.deleteMany();
  await prisma.house.deleteMany();
  await prisma.user.deleteMany();
  await prisma.settings.deleteMany();

  // ── Settings ──
  await prisma.settings.create({
    data: {
      id: "singleton",
      businessName: "Ivy House",
      ownerName: "Tatenda Moyo",
      ownerEmail: "owner@ivyhouse.local",
      ownerPhone: "+263770000001",
      currency: "USD",
      invoiceCounter: 1000,
      receiptCounter: 1000,
      statementCounter: 1000,
      paymentTermsDays: 7,
      defaultMessage: "Thank you for being part of the Ivy House community.",
    },
  });

  // ── Users ──
  const ownerPass = await bcrypt.hash("owner123", 10);
  const studentPass = await bcrypt.hash("student123", 10);
  const caretakerPass = await bcrypt.hash("caretaker123", 10);

  const owner = await prisma.user.create({
    data: {
      email: "owner@ivyhouse.local",
      name: "Tatenda Moyo",
      phone: "+263770000001",
      role: "OWNER",
      passwordHash: ownerPass,
    },
  });

  // ── House + Rooms (single residence: Ivy House) ──
  const houseRecords: Record<string, { id: string; rooms: { id: string; number: string; price: number; capacity: number }[] }> = {};
  for (const h of seedHouses) {
    const house = await prisma.house.create({
      data: {
        name: h.name,
        slug: h.slug,
        tagline: h.tagline,
        description: h.description,
        location: h.location,
        imageUrl: h.imageUrl,
        images: h.images,
        amenities: h.amenities,
        services: h.services,
        rules: h.rules,
        safetyInfo: h.safetyInfo,
      },
    });
    const rooms = [];
    for (const r of h.rooms) {
      const room = await prisma.room.create({
        data: {
          houseId: house.id,
          number: r.number,
          name: r.name,
          type: r.type,
          capacity: r.capacity,
          price: r.price,
          floor: r.floor,
          status: "AVAILABLE",
          amenities: r.amenities ?? [],
        },
      });
      rooms.push({ id: room.id, number: room.number, price: Number(room.price), capacity: room.capacity });
    }
    houseRecords[h.slug] = { id: house.id, rooms };
  }

  const ivy = houseRecords["ivy-house"];

  // ── Caretakers (both on-site at Ivy House) ──
  const caretakerUser = await prisma.user.create({
    data: {
      email: "caretaker@ivyhouse.local",
      name: "Joseph Banda",
      phone: "+263770000010",
      role: "CARETAKER",
      passwordHash: caretakerPass,
    },
  });
  const caretaker1 = await prisma.caretaker.create({
    data: {
      userId: caretakerUser.id,
      name: "Joseph Banda",
      phone: "+263770000010",
      email: "caretaker@ivyhouse.local",
      role: "Head Caretaker",
      houseId: ivy.id,
      notes: "Handles Ivy House day-to-day.",
    },
  });
  await prisma.caretaker.create({
    data: {
      name: "Grace Ncube",
      phone: "+263770000011",
      email: "grace.caretaker@ivyhouse.local",
      role: "Caretaker",
      houseId: ivy.id,
      notes: "Supports cleaning and maintenance at Ivy House.",
    },
  });

  // ── Active students (with a portal login for the demo student) ──
  const demoStudent = await prisma.user.create({
    data: {
      email: "student@ivyhouse.local",
      name: "Rumbidzai Chikwava",
      phone: "+263771111111",
      role: "STUDENT",
      passwordHash: studentPass,
    },
  });

  const demoRoom = ivy.rooms[0];
  const demoProfile = await prisma.studentProfile.create({
    data: {
      userId: demoStudent.id,
      fullName: "Rumbidzai Chikwava",
      email: "student@ivyhouse.local",
      phone: "+263771111111",
      nationalId: "63-1234567A12",
      age: 20,
      gender: "Female",
      institution: "Chinhoyi University of Technology",
      program: "BSc Computer Science",
      yearOfStudy: "2",
      houseId: ivy.id,
      roomId: demoRoom.id,
      status: "ACTIVE",
      moveInDate: new Date(Date.now() - 60 * 86400000),
      leaseStart: new Date(Date.now() - 60 * 86400000),
      leaseEnd: new Date(Date.now() + 300 * 86400000),
      nextOfKinName: "Patricia Chikwava",
      nextOfKinPhone: "+263772222222",
      nextOfKinRelation: "Mother",
    },
  });
  await prisma.room.update({
    where: { id: demoRoom.id },
    data: { occupied: 1, status: "OCCUPIED" },
  });

  // A couple more active students (all at Ivy House)
  const extraStudents = [
    {
      name: "Tafadzwa Dube",
      email: "tafadzwa@example.com",
      phone: "+263773333333",
      roomIdx: 1,
      program: "BCom Accounting",
    },
    {
      name: "Nyasha Marufu",
      email: "nyasha@example.com",
      phone: "+263774444444",
      roomIdx: 2,
      program: "LLB Law",
    },
  ];
  const studentProfiles = [demoProfile];
  let invCounter = 1000;
  let payCounter = 1000;
  let rctCounter = 1000;

  for (const s of extraStudents) {
    const u = await prisma.user.create({
      data: {
        email: s.email,
        name: s.name,
        phone: s.phone,
        role: "STUDENT",
        passwordHash: studentPass,
      },
    });
    const room = ivy.rooms[s.roomIdx];
    const profile = await prisma.studentProfile.create({
      data: {
        userId: u.id,
        fullName: s.name,
        email: s.email,
        phone: s.phone,
        institution: "Chinhoyi University of Technology",
        program: s.program,
        yearOfStudy: "1",
        houseId: ivy.id,
        roomId: room.id,
        status: "ACTIVE",
        moveInDate: new Date(Date.now() - 30 * 86400000),
        nextOfKinName: "Family Contact",
        nextOfKinPhone: "+263770000099",
        nextOfKinRelation: "Guardian",
      },
    });
    await prisma.room.update({
      where: { id: room.id },
      data: { occupied: { increment: 1 }, status: room.capacity <= 1 ? "OCCUPIED" : "AVAILABLE" },
    });
    studentProfiles.push(profile);
  }

  // ── Invoices, payments, receipts for active students ──
  for (const profile of studentProfiles) {
    const room = await prisma.room.findUnique({ where: { id: profile.roomId! } });
    const amount = room ? Number(room.price) : 180;
    invCounter++;
    const invoice = await prisma.invoice.create({
      data: {
        number: ref("INV", invCounter),
        studentProfileId: profile.id,
        description: `Accommodation — monthly rent`,
        amount,
        amountPaid: amount,
        status: "PAID",
        dueDate: new Date(Date.now() + 7 * 86400000),
      },
    });
    payCounter++;
    const payment = await prisma.payment.create({
      data: {
        reference: ref("PAY", payCounter),
        studentProfileId: profile.id,
        invoiceId: invoice.id,
        amount,
        method: "PAYNOW",
        status: "PAID",
        paidAt: new Date(Date.now() - 15 * 86400000),
        transaction: {
          create: { provider: "paynow", rawStatus: "Paid", providerRef: `MOCK-${ref("PAY", payCounter)}` },
        },
      },
    });
    rctCounter++;
    await prisma.receipt.create({
      data: {
        number: ref("RCT", rctCounter),
        paymentId: payment.id,
        amount,
      },
    });
  }

  // An outstanding invoice for the demo student (so balance + payment flow are visible)
  invCounter++;
  await prisma.invoice.create({
    data: {
      number: ref("INV", invCounter),
      studentProfileId: demoProfile.id,
      description: "Accommodation — next month rent",
      amount: demoRoom.price,
      amountPaid: 0,
      status: "SENT",
      dueDate: new Date(Date.now() + 7 * 86400000),
    },
  });
  payCounter++;
  await prisma.payment.create({
    data: {
      reference: ref("PAY", payCounter),
      studentProfileId: demoProfile.id,
      amount: demoRoom.price,
      method: "PAYNOW",
      status: "PENDING",
      paymentLink: "/student/payments/checkout?ref=" + ref("PAY", payCounter),
      transaction: { create: { provider: "paynow", rawStatus: "mock-initiated" } },
    },
  });

  // Advance document counters past every manually-seeded number so the first
  // auto-generated invoice/receipt/statement never collides with seed data.
  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      invoiceCounter: invCounter,
      receiptCounter: rctCounter,
      statementCounter: 1000,
    },
  });

  // ── Applications in various states (all at Ivy House) ──
  const apps = [
    {
      name: "Brian Sibanda",
      email: "brian@example.com",
      phone: "+263775555555",
      roomIdx: 4,
      status: "AWAITING_REVIEW" as const,
      program: "BSc Engineering",
    },
    {
      name: "Chiedza Mhike",
      email: "chiedza@example.com",
      phone: "+263776666666",
      roomIdx: 5,
      status: "NEW" as const,
      program: "BA Media Studies",
    },
    {
      name: "Kudzai Moyo",
      email: "kudzai@example.com",
      phone: "+263777777777",
      roomIdx: 6,
      status: "AWAITING_REVIEW" as const,
      program: "BSc Nursing",
    },
  ];
  let appCounter = 1000;
  for (const a of apps) {
    appCounter++;
    const room = ivy.rooms[a.roomIdx];
    await prisma.application.create({
      data: {
        reference: ref("APP", appCounter),
        fullName: a.name,
        email: a.email,
        phone: a.phone,
        institution: "Chinhoyi University of Technology",
        program: a.program,
        yearOfStudy: "1",
        houseId: ivy.id,
        roomId: room.id,
        status: a.status,
        agreedToTerms: true,
        nextOfKinName: "Next of Kin",
        nextOfKinPhone: "+263770000088",
        nextOfKinRelation: "Parent",
        specialNotes: "Prefers a quiet floor.",
      },
    });
    // Mark the chosen room as pending while application is open.
    await prisma.room.update({
      where: { id: room.id },
      data: { status: "PENDING_APPLICATION" },
    });
  }

  // ── Service requests ──
  await prisma.serviceRequest.create({
    data: {
      reference: ref("SRV", 1001),
      title: "Leaking tap in shared kitchen",
      description: "The cold water tap in the Ivy House communal kitchen drips constantly.",
      category: "MAINTENANCE",
      priority: "MEDIUM",
      status: "OPEN",
      houseId: ivy.id,
      studentProfileId: demoProfile.id,
      caretakerId: caretaker1.id,
    },
  });
  await prisma.serviceRequest.create({
    data: {
      reference: ref("SRV", 1002),
      title: "Flickering corridor light",
      description: "First-floor corridor light flickers in the evening.",
      category: "REPAIR",
      priority: "LOW",
      status: "IN_PROGRESS",
      houseId: ivy.id,
      caretakerId: caretaker1.id,
    },
  });
  await prisma.serviceRequest.create({
    data: {
      reference: ref("SRV", 1003),
      title: "Wi-Fi slow in second-floor rooms",
      description: "Residents report slow Wi-Fi after 8pm.",
      category: "UTILITY",
      priority: "HIGH",
      status: "ACKNOWLEDGED",
      houseId: ivy.id,
    },
  });

  // ── Announcements ──
  await prisma.announcement.create({
    data: {
      title: "Water maintenance this Saturday",
      body: "Municipal water will be off from 9am–1pm on Saturday. Borehole backup remains available.",
      audience: "ALL",
      channels: ["DASHBOARD", "SMS"],
      createdBy: owner.id,
    },
  });
  await prisma.announcement.create({
    data: {
      title: "Welcome to the new semester!",
      body: "We're glad to have you. Please review the house rules in your portal.",
      audience: "ALL",
      channels: ["DASHBOARD", "EMAIL"],
      createdBy: owner.id,
    },
  });

  // ── Owner dashboard notifications ──
  await prisma.notification.create({
    data: {
      userId: owner.id,
      audience: "OWNER",
      title: "3 applications awaiting review",
      body: "You have new student applications to review.",
      channel: "DASHBOARD",
      type: "application",
      link: "/owner/applications",
    },
  });
  await prisma.notification.create({
    data: {
      userId: demoStudent.id,
      title: "Welcome to your student portal",
      body: "View your room, payments, and statements here.",
      channel: "DASHBOARD",
      type: "welcome",
      link: "/student",
    },
  });

  console.log("✅ Seed complete.");
  console.log("\nLogin accounts:");
  console.log("  Owner:     owner@ivyhouse.local / owner123");
  console.log("  Student:   student@ivyhouse.local / student123");
  console.log("  Caretaker: caretaker@ivyhouse.local / caretaker123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
