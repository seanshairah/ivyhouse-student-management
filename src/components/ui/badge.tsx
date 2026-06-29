import * as React from "react";
import { cn } from "@/lib/utils";
import { BADGE_CLASSES } from "@/constants";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: keyof typeof BADGE_CLASSES;
}

/** Small status pill. `color` maps to a safe Tailwind palette key. */
function Badge({ className, color = "slate", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        BADGE_CLASSES[color] ?? BADGE_CLASSES.slate,
        className,
      )}
      {...props}
    />
  );
}

/** Convenience: render a status badge from a {label,color} meta object. */
export function StatusBadge({
  meta,
  className,
}: {
  meta: { label: string; color: string } | undefined;
  className?: string;
}) {
  if (!meta) return null;
  return (
    <Badge color={meta.color as keyof typeof BADGE_CLASSES} className={className}>
      {meta.label}
    </Badge>
  );
}

export { Badge };
