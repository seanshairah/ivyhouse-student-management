"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { provisionCaretakerLogin } from "@/app/owner/actions";

/**
 * "Send login" for a caretaker: creates (or resets) their portal account and
 * delivers a fresh temporary password by email + SMS. Safe to press again —
 * it always rotates the password, so whatever was delivered last still works
 * only until the next press.
 */
export function CaretakerLoginButton({
  caretakerId,
  hasLogin,
}: {
  caretakerId: string;
  hasLogin: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    const fd = new FormData();
    fd.set("caretakerId", caretakerId);
    startTransition(async () => {
      const res = await provisionCaretakerLogin(fd);
      if (res.success) toast.success(res.message ?? "Login sent.");
      else toast.error(res.error ?? "Could not provision login.");
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      title="Create login and send credentials by email + SMS"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
      {hasLogin ? "Resend login" : "Create login"}
    </Button>
  );
}
