# 🌿 Ivy House — Student Management System

A complete, production-minded platform for running **Ivy House**, a single purpose-built student residence in **Chinhoyi**, a short walk from the **Chinhoyi University of Technology (CUT) main campus**. It combines a bold, animated public marketing site, an online booking/application workflow, and role-based dashboards for the owner, students, and caretakers — with payments, email, SMS, invoices, receipts, statements, reporting, and a communication center.

Built to go cashless and automate most owner-side work: every important action updates the database, triggers the right communication, reflects in dashboards, and is logged.

> This system shares its functionality and workflows with the multi-house Student Housing platform, re-scoped to a single residence (Ivy House) with a distinct, Dribbble-inspired visual identity — a bright editorial layout with a signature orange accent.

---

## ✨ What it does

- **Public marketing website** — bold animated hero with a quick room search, room showcase, "Why Ivy House" highlights, a "How it works" flow, amenities, FAQs, contact, and a multi-step booking form.
- **Online booking** — students apply for a specific available room; the room is held to prevent double-booking; everyone is notified by email + SMS.
- **Owner dashboard** — overview KPIs & charts, the house, rooms, applications (approve/reject), students, payments, invoices, reports, services & caretakers, communication center, settings.
- **Student portal** — application status, assigned room, payments (Paynow-ready), receipts/invoices/statement downloads, announcements, profile updates, and maintenance requests.
- **Caretaker portal** — assigned house, service/maintenance tasks with status updates, owner messages, and notes back to the owner.
- **Automation** — invoices, receipts, statements, notifications, and status transitions are generated automatically through a service layer.

---

## 🧱 Tech stack

| Area | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS + custom shadcn-style UI kit |
| Animation | Framer Motion + CSS transitions |
| Database | PostgreSQL via Prisma ORM |
| Auth | Secure JWT sessions (httpOnly cookie, `jose` + `bcryptjs`) — a NextAuth-equivalent |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Email | Resend (primary) → SMTP fallback (Nodemailer) |
| SMS | Provider-adapter pattern (SMS Pop / BulkSMS-ready) |
| Payments | Paynow-ready abstraction with a development mock mode |

---

## 📁 Folder structure

```
ivyhouse-student-management/
├── prisma/
│   ├── schema.prisma          # Full relational schema + enums
│   └── seed.ts                # Seed data (Ivy House, rooms, users, applications, payments…)
├── public/                    # Static assets
├── src/
│   ├── app/
│   │   ├── page.tsx            # Public marketing home
│   │   ├── about/ houses/ book/  # Marketing + booking
│   │   ├── auth/login/         # Authentication
│   │   ├── owner/              # Owner/admin dashboard (modules + actions)
│   │   ├── student/            # Student portal
│   │   ├── caretaker/          # Caretaker portal
│   │   └── api/                # Document routes + Paynow webhook
│   ├── components/
│   │   ├── ui/                 # Button, Card, Input, Dialog, Table, … (design system)
│   │   ├── marketing/ dashboard/ charts/ navigation/ forms/
│   │   ├── owner/ student/ caretaker/
│   ├── lib/                    # prisma, auth, session, utils, validators, animation-config
│   ├── services/              # email, sms, payments, invoices, receipts, statements,
│   │                          #   notifications, messaging, reports, documents, audit
│   ├── hooks/ types/ constants/ data/
│   └── middleware.ts          # Role-based route protection
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Getting started

### 1. Prerequisites
- Node.js 18+ (tested on Node 22)
- A PostgreSQL database

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
```bash
cp .env.example .env
```
Then edit `.env`. At minimum set `DATABASE_URL`, `NEXTAUTH_SECRET`, and `APP_URL`. Generate a secret with:
```bash
openssl rand -base64 32
```
All third-party providers (Resend, SMTP, SMS Pop/BulkSMS, Paynow) are **optional** — the app runs fully in development/mock mode without them.

### 4. Create the schema & seed data
```bash
npm run prisma:push      # or: npm run prisma:migrate  (creates a migration)
npm run db:seed
```

### 5. Run the dev server
```bash
npm run dev
```
Visit http://localhost:3000.

### 6. Build for production
```bash
npm run build
npm start
```

---

## 🔑 Seeded login accounts

| Role | Email | Password |
| --- | --- | --- |
| Owner / Admin | `owner@ivyhouse.local` | `owner123` |
| Student | `student@ivyhouse.local` | `student123` |
| Caretaker | `caretaker@ivyhouse.local` | `caretaker123` |

After login you are routed to the dashboard for your role.

---

## 🧪 Testing the critical workflows

1. **Browse & apply** — open `/`, explore Ivy House, click **Book a Room**, pick an available room, and submit. You'll get a confirmation with a reference. The room status flips to *Pending Application* (no longer freely bookable).
2. **Owner reviews** — log in as the owner → **Applications** → open the new application → **Approve** (assign a room + amount). This creates the student, an invoice, and a Paynow payment link, and notifies the student.
3. **Student pays** — log in as that student (or the demo student) → **Payments** → **Pay now**. In development mode this routes to a simulated Paynow checkout; completing it marks the payment **Paid**, generates a **receipt**, updates the **invoice**, and notifies everyone.
4. **Documents** — download the invoice, receipt, and statement (printable HTML → Print/Save as PDF).
5. **Reports** — owner → **Reports** for financials, occupancy, outstanding balances, applications, and house performance (with CSV export).
6. **Communication** — owner → **Messages** to send Email/SMS to a group; every message is logged.
7. **Services** — student submits a maintenance request → caretaker updates its status → owner sees it under **Services**.

> In development mode, emails and SMS are **logged to the server console** (and recorded in `EmailLog` / `SmsLog`) instead of being sent. This keeps every workflow testable end-to-end with no API keys.

---

## 🔌 Plugging in providers (no re-architecting required)

### Resend (primary email)
Set `RESEND_API_KEY` and `EMAIL_FROM`. The email service automatically uses Resend first.

### SMTP (fallback email)
Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`. If Resend fails (or isn't set), the service falls back to SMTP.

### Bulk SMS — SMS Pop (primary)
Set `SMSPOP_API_KEY` (create a token in the SMS Pop dashboard under **API Tokens → Create**), `SMSPOP_SENDER_ID` (an **approved** sender/brand ID on your account), and `SMSPOP_BASE_URL` (`https://smspop.co.zw/api`). The SMS layer uses a provider-adapter pattern (`src/services/sms`); SMS Pop is used automatically when configured, sending via `POST /campaigns` with Bearer auth. Phone numbers are normalised to Zimbabwe MSISDN format (e.g. `0771234567` → `263771234567`). Swap in Twilio/Africa's Talking/etc. by implementing the `SmsProvider` interface. A generic `BULKSMS_*` adapter remains available as a fallback.

### Paynow
Set `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY`, `PAYNOW_RETURN_URL`, `PAYNOW_RESULT_URL`, and `PAYNOW_MODE=live`. The payment service (`src/services/payments`) already implements initiate/verify/return/result with the real Paynow hashing — switching from mock to live is purely env configuration. The result webhook lives at `POST /api/payments/paynow/result`.

---

## 🗄️ Data model (high level)

`User`, `House`, `Room`, `StudentProfile`, `Application`, `Invoice`, `Payment`, `PaymentTransaction`, `Receipt`, `Statement`, `Caretaker`, `ServiceRequest`, `Announcement`, `MessageLog`, `Notification`, `EmailLog`, `SmsLog`, `AuditLog`, `Settings`.

Enums: `UserRole`, `RoomStatus`, `RoomType`, `ApplicationStatus`, `StudentStatus`, `PaymentStatus`, `PaymentMethod`, `InvoiceStatus`, `NotificationChannel`, `MessageStatus`, `ServiceRequestStatus`, `ServiceRequestPriority`, `ServiceRequestCategory`, `AnnouncementAudience`.

The schema stays multi-house capable, but Ivy House is the single seeded residence. Double-booking is prevented with **server-side transactions**: the chosen room is re-checked inside the transaction and only reserved if still available.

---

## 🔐 Security

- Password hashing (bcrypt), JWT sessions in httpOnly cookies.
- Role-based route protection via `middleware.ts` **and** per-page `requireRole()` guards.
- All form/API inputs validated with Zod; sensitive logic runs server-side only.
- No API keys are exposed to the client.
- Audit logging of meaningful actions (`AuditLog`).

---

## 🎨 Design

The marketing site and dashboards use a bright, editorial layout with bold display typography and a **signature orange accent** over a sophisticated near-black ink — inspired by modern student-housing and luxury-living references. Marketing animations are driven by a central, accessible config: `src/lib/animation-config.ts` (with a JSON spec at `src/data/animation-config.json`). It defines reusable Framer Motion variants and per-section motion rules, and everything respects `prefers-reduced-motion`.

---

## ⚠️ Known limitations

- Email/SMS/Paynow run in **mock mode** until real keys are supplied (by design).
- Documents (invoice/receipt/statement) are printable HTML → "Save as PDF" via the browser rather than server-rendered PDFs.
- File/document uploads for students are a schema placeholder.
- A single owner-managed settings singleton (multi-tenant is out of scope).

---

## 📜 Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (runs `prisma generate`) |
| `npm start` | Start the production server |
| `npm run lint` | Lint |
| `npm run typecheck` | TypeScript check |
| `npm run prisma:push` | Push schema to the DB |
| `npm run prisma:migrate` | Create & run a migration |
| `npm run db:seed` | Seed demo data |
| `npm run prisma:studio` | Open Prisma Studio |

---

Built with care as a real, modern student-housing platform for Ivy House — not a school project.
