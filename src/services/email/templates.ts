import { renderTemplate } from "@/lib/utils";

interface BrandedOptions {
  heading: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  preheader?: string;
}

/** Wrap content in a clean, responsive branded email shell. */
export function brandedEmail(opts: BrandedOptions): string {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<tr><td style="padding:24px 0 4px;">
           <a href="${opts.ctaUrl}" style="display:inline-block;background:#171716;color:#ffffff;text-decoration:none;font-weight:600;padding:13px 28px;border-radius:10px;font-size:15px;letter-spacing:-0.1px;">${opts.ctaLabel}&nbsp;&rarr;</a>
         </td></tr>`
      : "";
  const preheader = (opts.preheader ?? opts.intro).replace(/<[^>]+>/g, "");
  return `<!doctype html><html lang="en"><head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
  <meta name="supported-color-schemes" content="light"/>
</head><body style="margin:0;padding:0;background:#faf9f7;font-family:ui-sans-serif,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#171716;-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border:1px solid #ececeb;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:26px 36px;border-bottom:1px solid #f0efed;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;"><span style="display:inline-block;width:26px;height:26px;border-radius:7px;background:#ff6b2c;"></span></td>
            <td style="vertical-align:middle;padding-left:10px;"><span style="font-size:16px;font-weight:700;letter-spacing:-0.2px;color:#171716;">Ivy House</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px 36px 8px;">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.35;font-weight:700;letter-spacing:-0.4px;color:#171716;">${opts.heading}</h1>
          <p style="margin:0 0 4px;font-size:15px;line-height:1.65;color:#52524d;">${opts.intro}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding-top:14px;font-size:15px;line-height:1.65;color:#52524d;">${opts.bodyHtml}</td></tr>
            ${cta}
          </table>
        </td></tr>
        <tr><td style="padding:28px 36px 30px;">
          <div style="border-top:1px solid #f0efed;padding-top:20px;">
            <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#6e6e68;">Questions? Just reply to this email &mdash; we're happy to help.</p>
            <p style="margin:0;font-size:12px;line-height:1.6;color:#a3a39d;">${opts.footerNote ?? "Automated message from the Ivy House platform. You're receiving it because you have an application or account with us."}</p>
          </div>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;font-size:11px;color:#b8b8b3;letter-spacing:0.02em;">Ivy House &middot; Student living in Chinhoyi</p>
    </td></tr>
  </table>
</body></html>`;
}

function row(label: string, value: string, last: boolean): string {
  const border = last ? "" : "border-bottom:1px solid #f0efed;";
  return `<tr><td style="padding:11px 0;${border}color:#8c8c86;font-size:13px;width:46%;vertical-align:top;">${label}</td><td style="padding:11px 0;${border}color:#171716;font-size:14px;font-weight:600;text-align:right;vertical-align:top;">${value}</td></tr>`;
}

export function detailTable(rows: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#faf9f7;border:1px solid #ececeb;border-radius:12px;padding:2px 18px;">${rows
    .map(([l, v], i) => row(l, v, i === rows.length - 1))
    .join("")}</table>`;
}

// ── Concrete templates ────────────────────────────────────────
export interface TemplateData {
  [key: string]: string | number;
}

export const emailTemplates = {
  applicationReceived: (d: TemplateData) =>
    brandedEmail({
      heading: "We've received your application 🎉",
      intro: `Hi ${d.studentName}, thank you for applying for accommodation at ${d.houseName}.`,
      bodyHtml: `Your booking has been received and is <strong>awaiting review</strong>. Your application reference is <strong>${d.reference}</strong>. ${detailTable(
        [
          ["House", String(d.houseName)],
          ["Room", String(d.roomName || "To be assigned")],
          ["Status", "Awaiting review"],
        ],
      )}You'll be notified by <strong>email and SMS</strong> as soon as your application has been reviewed. There's nothing more you need to do for now.`,
      preheader: "Your application is in — we'll review it and be in touch shortly.",
    }),

  newApplicationAlert: (d: TemplateData) =>
    brandedEmail({
      heading: "New accommodation application",
      intro: `A new application has been submitted for ${d.houseName}.`,
      bodyHtml: detailTable([
        ["Applicant", String(d.studentName)],
        ["Email", String(d.email)],
        ["Phone", String(d.phone)],
        ["House", String(d.houseName)],
        ["Room", String(d.roomName || "—")],
        ["Reference", String(d.reference)],
      ]),
      ctaLabel: "Review application",
      ctaUrl: String(d.reviewUrl || "#"),
    }),

  applicationApproved: (d: TemplateData) =>
    brandedEmail({
      heading: "Your application is approved! 🎉",
      intro: `Great news ${d.studentName} — your application for ${d.houseName} has been approved and your student portal account is ready.`,
      bodyHtml: `Use the login details below to sign in to your student portal. Once you're in, you'll be asked to <strong>pay your rent of ${d.amount}</strong> to activate your account — after that you'll have full access to your dashboard. ${detailTable(
        [
          ["House", String(d.houseName)],
          ["Room", String(d.roomName || "—")],
          ["Rent due", String(d.amount)],
        ],
      )}
      <div style="margin:18px 0 4px;border:1px solid #e6d9c6;border-radius:12px;padding:16px 18px;background:#faf6f1;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#a87c55;letter-spacing:0.05em;text-transform:uppercase;">Your login credentials</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:5px 0;color:#8c8c86;font-size:13px;">Email</td><td style="padding:5px 0;text-align:right;font-size:14px;font-weight:600;color:#171716;">${d.email}</td></tr>
          <tr><td style="padding:5px 0;color:#8c8c86;font-size:13px;">Temporary password</td><td style="padding:5px 0;text-align:right;"><span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;font-weight:700;color:#171716;background:#ffffff;border:1px solid #e6d9c6;border-radius:6px;padding:3px 9px;">${d.password}</span></td></tr>
        </table>
        <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#a3a39d;">You can change this password once you've signed in.</p>
      </div>`,
      ctaLabel: "Sign in & pay rent",
      ctaUrl: String(d.loginUrl || "#"),
    }),

  renewalReceived: (d: TemplateData) =>
    brandedEmail({
      heading: "We've received your renewal request",
      intro: `Hi ${d.studentName}, thanks for choosing to stay with us at ${d.houseName}.`,
      bodyHtml: `Your request to renew your stay is <strong>awaiting review</strong>. ${detailTable(
        [
          ["House", String(d.houseName)],
          ["Room", String(d.roomName || "—")],
          ["Requested term", String(d.term || "Next semester")],
          ["Reference", String(d.reference)],
          ["Status", "Awaiting review"],
        ],
      )}You'll be notified by <strong>email and SMS</strong> as soon as it's been reviewed.`,
    }),

  renewalApproved: (d: TemplateData) =>
    brandedEmail({
      heading: "Your stay renewal is approved! 🎉",
      intro: `Great news ${d.studentName} — your renewal for ${d.houseName} has been approved.`,
      bodyHtml: `Please sign in to your student portal and pay <strong>${d.amount}</strong> to confirm your room for ${d.term || "the new term"}. ${detailTable(
        [
          ["House", String(d.houseName)],
          ["Room", String(d.roomName || "—")],
          ["Term", String(d.term || "Next semester")],
          ["Amount due", String(d.amount)],
        ],
      )}Use your existing login details — no need for new credentials.`,
      ctaLabel: "Sign in & pay",
      ctaUrl: String(d.loginUrl || "#"),
    }),

  applicationRejected: (d: TemplateData) =>
    brandedEmail({
      heading: "Update on your application",
      intro: `Hi ${d.studentName}, thank you for your interest in ${d.houseName}.`,
      bodyHtml: `Unfortunately we're unable to offer you a room at this time. ${
        d.reason ? `<br/><br/><em>${d.reason}</em>` : ""
      }<br/><br/>Please reach out if you'd like to explore other options.`,
    }),

  paymentRequest: (d: TemplateData) =>
    brandedEmail({
      heading: "Your payment request is ready",
      intro: `Hi ${d.studentName}, here is your payment request for ${d.houseName}.`,
      bodyHtml: detailTable([
        ["Invoice", String(d.invoiceNumber)],
        ["Description", String(d.description)],
        ["Amount", String(d.amount)],
        ["Due date", String(d.dueDate || "—")],
      ]),
      ctaLabel: "Pay securely",
      ctaUrl: String(d.paymentUrl || "#"),
    }),

  paymentConfirmation: (d: TemplateData) =>
    brandedEmail({
      heading: "Payment received — thank you!",
      intro: `Hi ${d.studentName}, we've successfully received your payment.`,
      bodyHtml: detailTable([
        ["Receipt", String(d.receiptNumber)],
        ["Amount paid", String(d.amount)],
        ["Reference", String(d.reference)],
        ["Date", String(d.date)],
      ]),
      ctaLabel: "Download receipt",
      ctaUrl: String(d.receiptUrl || "#"),
    }),

  invoice: (d: TemplateData) =>
    brandedEmail({
      heading: `Invoice ${d.invoiceNumber}`,
      intro: `Hi ${d.studentName}, please find your invoice details below.`,
      bodyHtml: detailTable([
        ["Invoice", String(d.invoiceNumber)],
        ["Description", String(d.description)],
        ["Amount", String(d.amount)],
        ["Status", String(d.status)],
        ["Due date", String(d.dueDate || "—")],
      ]),
      ctaLabel: "View invoice",
      ctaUrl: String(d.invoiceUrl || "#"),
    }),

  receipt: (d: TemplateData) =>
    brandedEmail({
      heading: `Receipt ${d.receiptNumber}`,
      intro: `Hi ${d.studentName}, thank you for your payment. Here is your receipt.`,
      bodyHtml: detailTable([
        ["Receipt", String(d.receiptNumber)],
        ["Amount", String(d.amount)],
        ["Reference", String(d.reference)],
        ["Date", String(d.date)],
      ]),
    }),

  statement: (d: TemplateData) =>
    brandedEmail({
      heading: "Your account statement",
      intro: `Hi ${d.studentName}, here is a summary of your account.`,
      bodyHtml: detailTable([
        ["Total invoiced", String(d.totalDue)],
        ["Total paid", String(d.totalPaid)],
        ["Outstanding balance", String(d.balance)],
      ]),
      ctaLabel: "View full statement",
      ctaUrl: String(d.statementUrl || "#"),
    }),

  announcement: (d: TemplateData) =>
    brandedEmail({
      heading: String(d.title),
      intro: String(d.intro || "A new announcement from your housing team."),
      bodyHtml: String(d.body),
    }),

  serviceUpdate: (d: TemplateData) =>
    brandedEmail({
      heading: `Service update: ${d.title}`,
      intro: String(d.intro || "There's an update on a service request."),
      bodyHtml: String(d.body),
    }),

  // Sent to bulk-imported students with their temporary login credentials.
  onboardingInvite: (d: TemplateData) =>
    brandedEmail({
      heading: `Welcome to Ivy House, ${String(d.studentName).split(" ")[0]}! 🎉`,
      intro: `Your Ivy House student account has been created. We've recorded your deposit of ${d.deposit}. Please sign in to finish setting up your account.`,
      bodyHtml: `When you first sign in you'll be asked to <strong>set a new password</strong>, then to <strong>choose your room</strong> and add your <strong>next-of-kin details</strong> to complete your onboarding.
      <div style="margin:18px 0 4px;border:1px solid #e6d9c6;border-radius:12px;padding:16px 18px;background:#faf6f1;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#a87c55;letter-spacing:0.05em;text-transform:uppercase;">Your login credentials</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:5px 0;color:#8c8c86;font-size:13px;">Email</td><td style="padding:5px 0;text-align:right;font-size:14px;font-weight:600;color:#171716;">${d.email}</td></tr>
          <tr><td style="padding:5px 0;color:#8c8c86;font-size:13px;">Temporary password</td><td style="padding:5px 0;text-align:right;"><span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;font-weight:700;color:#171716;background:#ffffff;border:1px solid #e6d9c6;border-radius:6px;padding:3px 9px;">${d.password}</span></td></tr>
        </table>
        <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#a3a39d;">For your security you'll be required to change this password the first time you sign in.</p>
      </div>`,
      ctaLabel: "Sign in & complete onboarding",
      ctaUrl: String(d.loginUrl || "#"),
    }),

  // (Re)issued login credentials — used by the rotate-on-send credential flow.
  credentialsIssued: (d: TemplateData) =>
    brandedEmail({
      heading: `Your Ivy House login is ready, ${String(d.studentName).split(" ")[0]}`,
      intro: "Here are your login details for the Ivy House student portal. Please sign in to set your own password and finish onboarding.",
      bodyHtml: `On first sign-in you'll be asked to <strong>set a new password</strong>, then to <strong>enter your room</strong> and add your <strong>next-of-kin details</strong>.
      <div style="margin:18px 0 4px;border:1px solid #e6d9c6;border-radius:12px;padding:16px 18px;background:#faf6f1;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#a87c55;letter-spacing:0.05em;text-transform:uppercase;">Your login credentials</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:5px 0;color:#8c8c86;font-size:13px;">Email</td><td style="padding:5px 0;text-align:right;font-size:14px;font-weight:600;color:#171716;">${d.email}</td></tr>
          <tr><td style="padding:5px 0;color:#8c8c86;font-size:13px;">Temporary password</td><td style="padding:5px 0;text-align:right;"><span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;font-weight:700;color:#171716;background:#ffffff;border:1px solid #e6d9c6;border-radius:6px;padding:3px 9px;">${d.password}</span></td></tr>
        </table>
        <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#a3a39d;">You'll be required to change this password the first time you sign in.</p>
      </div>`,
      ctaLabel: "Sign in & complete onboarding",
      ctaUrl: String(d.loginUrl || "#"),
    }),

  // Sent to a newly-created owner/admin account with temporary credentials.
  adminWelcome: (d: TemplateData) =>
    brandedEmail({
      heading: "Your Ivy House admin account is ready",
      intro: `Hi ${String(d.studentName).split(" ")[0]}, an owner/admin account has been created for you on the Ivy House platform.`,
      bodyHtml: `Sign in with the temporary credentials below. You'll be prompted to set a new password before you can access the dashboard.
      <div style="margin:18px 0 4px;border:1px solid #e6d9c6;border-radius:12px;padding:16px 18px;background:#faf6f1;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#a87c55;letter-spacing:0.05em;text-transform:uppercase;">Your login credentials</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:5px 0;color:#8c8c86;font-size:13px;">Email</td><td style="padding:5px 0;text-align:right;font-size:14px;font-weight:600;color:#171716;">${d.email}</td></tr>
          <tr><td style="padding:5px 0;color:#8c8c86;font-size:13px;">Temporary password (OTP)</td><td style="padding:5px 0;text-align:right;"><span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;font-weight:700;color:#171716;background:#ffffff;border:1px solid #e6d9c6;border-radius:6px;padding:3px 9px;">${d.password}</span></td></tr>
        </table>
        <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#a3a39d;">You'll be required to change this password the first time you sign in.</p>
      </div>`,
      ctaLabel: "Sign in",
      ctaUrl: String(d.loginUrl || "#"),
    }),
};

export type EmailTemplateName = keyof typeof emailTemplates;

export function renderEmail(
  template: EmailTemplateName,
  data: TemplateData,
): string {
  return emailTemplates[template](data);
}

export { renderTemplate };
