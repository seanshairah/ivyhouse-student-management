import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";
import { getSession, homeForRole } from "@/lib/auth";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { Card, CardContent } from "@/components/ui/card";
import { platform } from "@/core/platform";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  const session = await getSession();
  if (session) redirect(homeForRole(session.role));

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-background to-sand-50 px-4 py-12">
      <div className="absolute -left-24 top-10 size-72 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="absolute -right-24 bottom-10 size-72 rounded-full bg-sand-200/40 blur-3xl" />

      <div className="relative w-full max-w-md">
        <Link
          href="/auth/login"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" /> Back to sign in
        </Link>

        <Card className="border-brand-100/70 shadow-xl">
          <CardContent className="p-7">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-2xl gradient-accent text-white shadow-md shadow-sand-400/30">
                <KeyRound className="size-6" />
              </div>
              <h1 className="font-display text-2xl font-bold">Forgot your password?</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a link to set a new one
                for your {platform().name} account.
              </p>
            </div>

            <ForgotPasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
