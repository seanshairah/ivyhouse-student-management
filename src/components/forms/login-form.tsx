"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, LogIn } from "lucide-react";
import { loginAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/types";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    loginAction,
    null,
  );

  useEffect(() => {
    if (state?.success) {
      const dest = next || (state.data as { redirect: string })?.redirect || "/";
      toast.success("Welcome back!");
      router.push(dest);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router, next]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </div>
      <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <LogIn className="size-4" />
        )}
        Sign in
      </Button>
    </form>
  );
}
