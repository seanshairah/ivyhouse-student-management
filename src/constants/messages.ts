/** Reusable SMS / notification message templates. Use renderTemplate() to fill. */

export const SMS_TEMPLATES = {
  applicationReceived:
    "Hi {{studentName}}, your accommodation application for {{houseName}} has been received and is awaiting review. We'll notify you by email and SMS once it's been reviewed. No action needed for now.",
  applicationApproved:
    "Hi {{studentName}}, your application for {{houseName}} is APPROVED. Sign in to your student portal at {{loginUrl}} with email {{email}} and password {{password}} to pay your rent and activate your account.",
  applicationRejected:
    "Hi {{studentName}}, thank you for applying to {{houseName}}. Unfortunately we are unable to offer you a room at this time. Please contact us for other options.",
  paymentLinkGenerated:
    "Hi {{studentName}}, a payment request of {{amount}} for {{houseName}} is ready. Pay securely via your student portal or the link in your email.",
  paymentCompleted:
    "Hi {{studentName}}, we have received your payment of {{amount}}. Thank you! Your receipt {{receiptNumber}} is available in your portal.",
  paymentReminder:
    "Hi {{studentName}}, this is a friendly reminder that you have an outstanding balance of {{amount}} for {{houseName}}. Please settle it via your portal.",
  movedIn:
    "Hi {{studentName}}, welcome to {{houseName}}! Your room {{roomNumber}} is ready. Enjoy your stay.",
  renewalReceived:
    "Hi {{studentName}}, we've received your request to renew your stay at {{houseName}} for {{term}}. It's awaiting review — we'll notify you by email and SMS shortly.",
  renewalApproved:
    "Hi {{studentName}}, your renewal for {{houseName}} ({{term}}) is APPROVED. Sign in to your student portal and pay {{amount}} to confirm your room for the new term.",
  onboardingInvite:
    "Hi {{studentName}}, welcome to Ivy House! Your account is ready. Sign in at {{loginUrl}} with email {{email}} and temporary password {{password}}. You'll set a new password, then choose your room and add next-of-kin details to finish onboarding.",
  credentialsIssued:
    "Hi {{studentName}}, your Ivy House student portal is ready. Sign in at {{loginUrl}} with email {{email}} and temporary password {{password}}. You'll set your own password and complete onboarding on first sign-in.",
  adminWelcome:
    "Hi {{studentName}}, your Ivy House admin account is ready. Sign in at {{loginUrl}} with email {{email}} and temporary password {{password}}. You'll be asked to set a new password on first sign in.",
} as const;

export const EMAIL_SUBJECTS = {
  applicationReceived: "We've received your accommodation application",
  newApplicationAlert: "New accommodation application received",
  applicationApproved: "Your accommodation application is approved 🎉",
  applicationRejected: "Update on your accommodation application",
  paymentRequest: "Your payment request is ready",
  paymentConfirmation: "Payment received — thank you",
  invoice: "Your invoice from {{houseName}}",
  receipt: "Your receipt {{receiptNumber}}",
  statement: "Your account statement",
  announcement: "{{title}}",
  serviceUpdate: "Service update: {{title}}",
  renewalReceived: "We've received your renewal request",
  renewalApproved: "Your stay renewal is approved 🎉",
  onboardingInvite: "Welcome to Ivy House — your account is ready 🎉",
  adminWelcome: "Your Ivy House admin account is ready",
  credentialsIssued: "Your Ivy House login details",
} as const;
