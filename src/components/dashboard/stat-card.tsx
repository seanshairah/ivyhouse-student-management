import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: keyof typeof Icons;
  hint?: string;
  trend?: { value: string; up?: boolean };
  accent?: "brand" | "blue" | "amber" | "rose" | "emerald" | "slate";
}

const ACCENTS: Record<string, string> = {
  brand: "bg-sand-50 text-sand-500",
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  emerald: "bg-emerald-50 text-emerald-600",
  slate: "bg-slate-100 text-slate-600",
};

export function StatCard({
  label,
  value,
  icon = "Activity",
  hint,
  trend,
  accent = "brand",
}: StatCardProps) {
  const Icon = Icons[icon] as React.ComponentType<{ className?: string }>;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-tight text-muted-foreground sm:text-sm">
            {label}
          </p>
          <p className="mt-1.5 font-display text-xl font-bold tracking-tight sm:text-2xl">
            {value}
          </p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
          {trend && (
            <p
              className={cn(
                "mt-1 inline-flex items-center gap-1 text-xs font-medium",
                trend.up ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {trend.up ? (
                <Icons.TrendingUp className="size-3.5" />
              ) : (
                <Icons.TrendingDown className="size-3.5" />
              )}
              {trend.value}
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-11",
            ACCENTS[accent],
          )}
        >
          {Icon && <Icon className="size-4 sm:size-5" />}
        </div>
      </div>
    </Card>
  );
}
