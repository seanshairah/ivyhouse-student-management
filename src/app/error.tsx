"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
        <AlertTriangle className="size-7" />
      </div>
      <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        An unexpected error occurred. Please try again.
      </p>
      <Button onClick={reset} variant="brand" className="mt-6">
        Try again
      </Button>
    </div>
  );
}
