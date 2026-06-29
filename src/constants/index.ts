export const APP_NAME = "Ivy House";
export const APP_TAGLINE =
  "Secure, verified student living beside Chinhoyi's main campus.";

export const HOUSES = {
  IVY: { name: "Ivy House", slug: "ivy-house" },
} as const;

export const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "The House", href: "/houses" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "FAQs", href: "/#faqs" },
  { label: "Contact", href: "/#contact" },
];

// ── Status display metadata ───────────────────────────────────
export const ROOM_STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  AVAILABLE: { label: "Available", color: "emerald" },
  PENDING_APPLICATION: { label: "Pending", color: "amber" },
  RESERVED: { label: "Reserved", color: "blue" },
  OCCUPIED: { label: "Occupied", color: "slate" },
  MAINTENANCE: { label: "Maintenance", color: "orange" },
  UNAVAILABLE: { label: "Unavailable", color: "rose" },
};

export const APPLICATION_STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  NEW: { label: "New", color: "blue" },
  AWAITING_REVIEW: { label: "Awaiting Review", color: "amber" },
  APPROVED: { label: "Approved", color: "emerald" },
  REJECTED: { label: "Rejected", color: "rose" },
  PAYMENT_PENDING: { label: "Payment Pending", color: "orange" },
  PAID: { label: "Paid", color: "emerald" },
  MOVED_IN: { label: "Moved In", color: "brand" },
  CANCELLED: { label: "Cancelled", color: "slate" },
};

export const PAYMENT_STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  PENDING: { label: "Pending", color: "amber" },
  PROCESSING: { label: "Processing", color: "blue" },
  PAID: { label: "Paid", color: "emerald" },
  FAILED: { label: "Failed", color: "rose" },
  CANCELLED: { label: "Cancelled", color: "slate" },
  REFUNDED: { label: "Refunded", color: "orange" },
};

export const INVOICE_STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  DRAFT: { label: "Draft", color: "slate" },
  SENT: { label: "Sent", color: "blue" },
  PARTIALLY_PAID: { label: "Partially Paid", color: "amber" },
  PAID: { label: "Paid", color: "emerald" },
  OVERDUE: { label: "Overdue", color: "rose" },
  CANCELLED: { label: "Cancelled", color: "slate" },
};

export const STUDENT_STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  PROSPECT: { label: "Prospect", color: "slate" },
  APPLICANT: { label: "Applicant", color: "blue" },
  ACTIVE: { label: "Active", color: "emerald" },
  ARREARS: { label: "In Arrears", color: "rose" },
  MOVED_OUT: { label: "Moved Out", color: "slate" },
  ARCHIVED: { label: "Archived", color: "slate" },
};

export const SERVICE_STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  OPEN: { label: "Open", color: "blue" },
  ACKNOWLEDGED: { label: "Acknowledged", color: "amber" },
  IN_PROGRESS: { label: "In Progress", color: "orange" },
  RESOLVED: { label: "Resolved", color: "emerald" },
  CLOSED: { label: "Closed", color: "slate" },
  CANCELLED: { label: "Cancelled", color: "slate" },
};

export const PRIORITY_META: Record<string, { label: string; color: string }> = {
  LOW: { label: "Low", color: "slate" },
  MEDIUM: { label: "Medium", color: "blue" },
  HIGH: { label: "High", color: "orange" },
  URGENT: { label: "Urgent", color: "rose" },
};

// Tailwind-safe badge classes by color key.
export const BADGE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/20",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/20",
};
