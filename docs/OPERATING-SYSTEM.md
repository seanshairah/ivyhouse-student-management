# The Student Housing Operating System

One engine, two brands. This document explains how the shared system works, and
what is allowed to differ between the two platforms that run on it.

> This file is part of the shared core and is **identical** in both
> repositories. If something here is only true of one platform, it belongs in
> `src/platform/config.ts` instead.

---

## 1. Architecture

Two deployments, two databases, one codebase.

```
  ivyhouse.co.zw                          blessbriproperties.co.zw
        │                                           │
   ┌────┴─────────────┐                   ┌─────────┴────────┐
   │  Ivy House app   │                   │  Blessbri app    │
   │                  │                   │                  │
   │  marketing site  │  ← independent →  │  marketing site  │
   │  (own brand)     │                   │  (own brand)     │
   ├──────────────────┤                   ├──────────────────┤
   │ src/platform/    │                    │ src/platform/    │
   │   config.ts      │  ← ONLY diff →     │   config.ts      │
   ├──────────────────┤                   ├──────────────────┤
   │  src/core/**     │  ═ identical ═     │  src/core/**     │
   │  payments, ledger│                    │  payments, ledger│
   │  auth, schema    │                    │  auth, schema    │
   └────────┬─────────┘                   └─────────┬────────┘
            │                                       │
      ┌─────┴──────┐                          ┌─────┴──────┐
      │ Ivy DB     │                          │ Blessbri DB│
      └────────────┘                          └────────────┘
```

**Why separate databases rather than one multi-tenant database?**

These are two different businesses. The requirement is that a user or
administrator on one platform can never reach the other's records. There were
three options:

| Option | Isolation | Risk |
|---|---|---|
| One multi-tenant app + shared DB | Depends on every query remembering a `where tenantId` | High — ~20 models, none had a tenant column, and there were no tests to catch a missed filter |
| Shared codebase, separate DBs | Physical — no shared rows exist | Low |
| Shared core package, two apps | Same as above, plus packaging work | Low, more moving parts |

We chose **separate databases**. Cross-tenant leakage is impossible by
construction rather than by discipline: there is no query you can write in the
Ivy House app that reaches a Blessbri row, because the row is not in the
database it is connected to. Retrofitting row-level tenancy into every query in
a codebase that had zero tests would have been the riskiest available option.

This also keeps the `Settings` singleton and the invoice/receipt/statement
numbering counters correct — each business gets its own sequence.

**Defence in depth.** `Settings.platformKey` records which platform a database
belongs to. `assertDatabaseBelongsToPlatform()` in `src/core/platform/index.ts`
refuses to use a database that claims to belong to somebody else, so a
copy-pasted `DATABASE_URL` fails loudly instead of quietly serving one
business's students under the other's brand.

---

## 2. What is shared, and what is not

**Shared (identical in both repos — never fork these):**

```
src/core/platform/     platform config types + env and database guards
src/core/billing/      the ledger and pricing — all money logic
src/core/auth/         record-level access control, rate limiting, password reset
src/services/payments/ Paynow integration and settlement
src/services/invoices/ invoice documents and balance access
src/services/reports/  owner reporting
src/lib/auth.ts        sessions, password hashing
src/lib/session.ts     requireUser / requireRole
prisma/schema.prisma   the database schema
tests/                 the test suite
```

**Platform-specific (allowed and expected to differ):**

```
src/platform/config.ts       name, contact, senders, rates, prefixes
src/app/page.tsx             the public landing page
src/app/houses, /about       public marketing pages
src/components/marketing/**  brand imagery, copy, hero, testimonials
tailwind.config.ts           brand colours
public/                      logos and images
```

The marketing sites are deliberately **not** driven by the config file. They are
separate brands with separate audiences and are meant to look nothing alike.

---

## 3. The ledger — how money works

This is the part to understand before changing anything financial.

### One source of truth

A balance is never stored. It is always derived:

```
balance = sum(OUTSTANDING charges) − sum(allocations against those charges)
```

`getStudentAccount()` in `src/core/billing/ledger.ts` is the only function that
answers "what does this student owe?". The student dashboard, the owner's
student page and the reports all call it, so they cannot disagree.

### Rent and transport are separate by construction

Every `Charge` carries a `ChargeCategory`:

```
RENT · TRANSPORT · DEPOSIT · PENALTY · ADJUSTMENT · OTHER
```

The category is recorded when the charge is raised. It is never inferred from
text. (Previously one platform decided "is this a deposit?" with
`reference.startsWith("DEP-")` and the other with `/deposit/i` against a
free-text description — two different answers to the same question.)

`getStudentAccount()` returns `rent`, `transport` and `other` as their own
balances, plus `totalOutstanding` — so a student sees both the split and the
combined position.

### Payments attach to charges through allocations

```
  Charge  ◄──── PaymentAllocation ────►  Payment
  (what is owed)   (how much of that      (money received)
                    payment covers it)
```

This is what makes the awkward cases work without special-casing:

- **Partial payment** — one charge, several allocations, remainder still owing.
- **Combined payment** — one payment, several allocations across categories.
- **Overpayment** — leftover stays as `unallocatedCredit`; money is never lost.
- **Refund** — `deallocatePayment()` removes the allocations and returns the
  charges to `OUTSTANDING`.

Allocation order: the payment's own category first (a transport payment clears
transport debt, never rent), then oldest due date first.

### Idempotency

`PaymentAllocation` is unique on `(paymentId, chargeId)`, and `allocatePayment()`
first undoes anything the payment previously did, then redoes it. A webhook that
fires three times produces exactly one allocation and one receipt.

---

## 4. The payment lifecycle

```
  student picks a PURPOSE (never an amount)
        │
        ▼
  createSelfPayment()
    ├─ prices the purpose server-side from the room tier + platform config
    ├─ reuses any identical payment started in the last 90s (double-click guard)
    ├─ raises the Charge  ← the debt exists before the money is asked for
    └─ initiates with Paynow (EcoCash / OneMoney prompt, or hosted checkout)
        │
        ▼
  PENDING ──────────────────────────────────────┐
        │                                       │
   Paynow confirms                        student cancels
        │                                    / declines
        ▼                                       ▼
  settlePayment()  (one transaction)         FAILED / CANCELLED
    ├─ status → PAID
    ├─ receipt issued
    └─ allocatePayment() → balance moves
        │
        ▼
     PAID ──── provider reverses ────► REFUNDED
                                        └─ charges return to OUTSTANDING
```

### Rules that are enforced in code, not by convention

1. **The browser never sets an amount.** It sends a `PaymentPurpose`
   (`RENT_MONTH` / `RENT_SEMESTER` / `TRANSPORT_MONTH`); `priceFor()` decides
   the money.
2. **The webhook body is never trusted.** `POST /api/payments/paynow/result`
   takes only the `reference` from the payload and then re-polls Paynow
   server-to-server. A forged `status=Paid` cannot settle anything.
3. **Only `settlePayment()` may set `PAID`,** and only after Paynow confirms.
4. **The state machine is explicit.** `canTransition()` permits:

   | From | To |
   |---|---|
   | `PENDING` | `PROCESSING`, `PAID`, `FAILED`, `CANCELLED` |
   | `PROCESSING` | `PAID`, `FAILED`, `CANCELLED` |
   | `PAID` | `REFUNDED` *(the only way out of PAID)* |
   | `FAILED` | `PENDING` *(provider retry of the same reference)* |
   | `CANCELLED`, `REFUNDED` | terminal |

   Anything else is rejected and logged, so a late or out-of-order callback
   cannot rewrite settled history.
5. **Mock mode cannot run in production.** In development `verifyPaynowPayment()`
   reports every payment as paid; `getPaynowConfig()` throws in production if the
   Paynow credentials are missing rather than silently falling back to it.
6. **Inbound Paynow data is signature-checked.** We signed our outbound requests
   but never verified anything coming back. `verifyPaynowHash()` now checks the
   SHA-512 Paynow puts on the poll response — the payload that actually promotes
   a payment to `PAID` — using a constant-time comparison. A wrong hash is
   treated as hostile and refused; a missing one is logged and falls back to TLS,
   so an unexpected payload shape can't strand real payments.

---

## 5. Configuration

`src/platform/config.ts` holds everything a platform is allowed to vary:

| Field | What it controls |
|---|---|
| `key` | `"ivy-house"` / `"blessbri"` — must match `Settings.platformKey` |
| `name`, `legalName`, `tagline` | how the platform refers to itself in the OS |
| `contact` | support details shown to students |
| `senders.emailFrom` | must be on a domain verified with the email provider |
| `senders.smsSenderId` | must be an approved sender ID |
| `billing.rentByRoomType` | monthly rent per sharing tier |
| `billing.transportMonthlyFee` | flat monthly transport fee |
| `billing.semesterMonths` | months billed as one semester |
| `billing.paymentTermsDays` | days before a charge counts as arrears |
| `billing.allowPartial/CombinedPayments` | payment policy |
| `documents.*Prefix` | invoice / receipt / statement numbering prefixes |

### Required environment variables

The app **refuses to start in production** without these:

```
DATABASE_URL          this platform's own database — never the other one's
NEXTAUTH_SECRET       openssl rand -base64 32
```

Required for real payments (production throws without them):

```
PAYNOW_INTEGRATION_ID
PAYNOW_INTEGRATION_KEY
PAYNOW_MODE=live
PAYNOW_RETURN_URL     https://<domain>/student/payments/return
PAYNOW_RESULT_URL     https://<domain>/api/payments/paynow/result
```

Optional (features degrade quietly if absent): `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, SMTP fallback, `SMSPOP_API_KEY`, `SMSPOP_SENDER_ID`.

---

## 6. Running and deploying

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL + NEXTAUTH_SECRET
npx prisma migrate deploy     # apply migrations
npm run db:seed               # demo data (development only)
npm run dev
```

Checks:

```bash
npm run typecheck
npm run lint
npm test                      # needs a PostgreSQL database
npm run build
```

### Migrations

`prisma/migrations/` contains:

- `20260728000000_init` — the schema as it stood before unification.
- `20260728000100_unified_ledger` — charges, allocations, indexes, the
  `usesTransport → transportOptIn` rename, and a **backfill** that turns
  existing invoices into charges and re-creates their allocations, so balances
  do not reset to zero.

**On a database that predates migrations** (both platforms used `prisma db push`
and have no `_prisma_migrations` table), mark the baseline as already applied
before deploying, or `migrate deploy` will try to recreate existing tables:

```bash
npx prisma migrate resolve --applied 20260728000000_init
npx prisma migrate deploy
```

Take a database snapshot first. The backfill is additive — it inserts `Charge`
and `PaymentAllocation` rows and renames one column — but the rename is not
reversible without a restore.

### Applying to a database built with `db push`

Both production databases were created with `prisma db push` and had no
`_prisma_migrations` table. The delta migration is written to be **idempotent
and re-runnable** (`DO $mig$` guards, `IF NOT EXISTS`, `ON CONFLICT`) because
the two were not in identical states — one already carried `transportOptIn`
while the other still had `usesTransport`. Record the baseline as applied, then
deploy:

```bash
npx prisma migrate resolve --applied 20260728000000_init
npx prisma migrate deploy
```

The backfill also repairs money the old schema could not see:

| Step | What it fixes |
|---|---|
| Invoices → charges | balances stop reading zero after the cutover |
| Paid payments with **no invoice** → charge + allocation | self-service payments and hand-recorded deposits become countable |
| Receipts for paid payments that had none | students get proof of payment |
| `PENDING` older than 24h → `CANCELLED` | dashboards stop showing a payment "in progress" forever |

After migrating, every dollar received should equal every dollar allocated:

```sql
SELECT (SELECT COALESCE(SUM(amount),0) FROM "Payment" WHERE status = 'PAID') AS received,
       (SELECT COALESCE(SUM(amount),0) FROM "PaymentAllocation")             AS allocated;
```

### Test accounts

Seeded test students are prefixed `test_` and can be removed with:

```sql
DELETE FROM "Charge"  WHERE "studentProfileId" = 'test_profile_seed';
DELETE FROM "Payment" WHERE "studentProfileId" = 'test_profile_seed';
DELETE FROM "StudentProfile" WHERE id = 'test_profile_seed';
DELETE FROM "User"           WHERE id = 'test_user_seed';
```

### Renaming a column on a live database

`20260728000100` renamed `usesTransport` to `transportOptIn`. That rename is
correct but **not backwards compatible**: a deployment still running the
previous build has a Prisma client that names the old column explicitly in its
SELECT lists, so every query touching `StudentProfile` fails the moment the
rename lands — the live site returns "Something went wrong" until the new build
ships. Migrating the database ahead of the code is normally safe; a rename is
the exception.

`20260728000300` is the fix, and the pattern to copy next time: **expand /
contract**. Both column names exist, kept in lockstep by a trigger, so old and
new code run against the same database at once and deploy order stops mattering.

Once BOTH platforms are deployed on the new build, run the contract step:

```sql
DROP TRIGGER IF EXISTS student_transport_sync ON "StudentProfile";
DROP FUNCTION IF EXISTS sync_student_transport();
ALTER TABLE "StudentProfile" DROP COLUMN IF EXISTS "usesTransport";
```

Until then, leave it in place.

### Rollback

The previous release runs against the migrated schema: the new tables are
additive and the old code ignores them. The one exception is the
`usesTransport → transportOptIn` rename, which the old code still reads. To roll
back the application without restoring the database:

```sql
ALTER TABLE "StudentProfile" RENAME COLUMN "transportOptIn" TO "usesTransport";
```

Then redeploy the previous build. To roll back fully, restore the snapshot.

---

## 6a. Access control

Authentication answers *who are you*. Authorisation answers *may you touch this
record* — and that second check was missing on anything that took an id from the
client. Any signed-in student could read any other student's invoice, receipt or
account statement by changing the id in the URL.

`src/core/auth/access.ts` is now the single place that decides:

| Helper | Question |
|---|---|
| `canAccessStudent` | may this actor see this student's records? |
| `canAccessInvoice` | …this invoice? |
| `canAccessReceipt` | …this receipt? |
| `canAccessPayment` | …act on this payment? |

Staff (`OWNER`, `CARETAKER`) may reach any record **in their own database** —
safe precisely because each platform has its own, so there is no other
business's data present to reach. Students get their own records only.

Denials return **404, not 403**, so the endpoints can't be used to probe which
ids exist.

### Rate limiting

`src/core/auth/rate-limit.ts` — a sliding window kept in the database, because
both platforms run on serverless where an in-process counter spans one warm
instance at best and an attacker spreading guesses across cold starts never
hits it.

| Bucket | Limit |
|---|---|
| `login:<email>` | 8 per 15 min, cleared on success |
| `reset:<email>` | 3 per 15 min |
| `pay:<profileId>` | 12 per 10 min |

It fails **open**: if the table is unreachable, requests are allowed. Rate
limiting is a mitigation, not the security boundary — authentication and
authorisation are, and those fail closed.

Login also always runs a bcrypt comparison, against a dummy hash when the email
isn't registered, so an unknown account takes the same time as a wrong password.

### Password recovery

`src/core/auth/password-reset.ts`. Previously there was none — a student who
forgot their password had to ask an administrator to reset it by hand.

- Only the SHA-256 of the token is stored; a database leak yields hashes, not
  working links.
- Single-use and one hour long. Requesting a new link invalidates the old one.
- Redeeming claims the token with a compare-and-set inside the same transaction
  that writes the password, so two concurrent submissions can't both succeed.
- The response is identical whether or not the email is registered — otherwise
  the form becomes a way to enumerate the student roll.
- Redeeming clears `mustChangePassword`: they have just chosen a password.
- Success does **not** sign the user in. Possession of an emailed link
  shouldn't hand out a session.

## 7. Roles

| Role | Can do |
|---|---|
| `OWNER` | everything: students, rooms, applications, charges, payments, reports, settings |
| `CARETAKER` | house operations and service requests |
| `STUDENT` | their own account, payments, receipts, service requests |

Enforcement is layered:

- `src/middleware.ts` gates `/owner`, `/student`, `/caretaker` by role from the
  session cookie.
- `requireUser()` / `requireRole()` re-read the user from the database on every
  protected page, so a deactivated account or a pending forced password change
  takes effect immediately rather than when the 7-day JWT expires.
- Server actions additionally assert **ownership** — `assertOwnsPayment()` means
  a student cannot poll, settle or read a payment that is not theirs.

---

## 8. Adding a third platform

1. Fork the repository.
2. Replace `src/platform/config.ts` with the new platform's values and add its
   `key` to `PlatformKey` in `src/core/platform/types.ts`.
3. Replace the marketing pages, `public/` assets and `tailwind.config.ts` colours.
4. Provision a new database; set `Settings.platformKey` to the new key.
5. Leave `src/core/**` alone.
