"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PayButtonProps {
  reference: string;
  label?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "brand" | "outline";
  className?: string;
}

/** Inline "Pay now" — links to the simulated checkout for the reference. */
export function PayButton({
  reference,
  label = "Pay now",
  size = "sm",
  variant = "brand",
  className,
}: PayButtonProps) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      disabled={pending}
      onClick={() =>
        start(() => {
          router.push(
            `/student/payments/checkout?ref=${encodeURIComponent(reference)}`,
          );
        })
      }
    >
      {pending ? (
        <Loader2 className="animate-spin" />
      ) : (
        <CreditCard />
      )}
      {label}
    </Button>
  );
}
