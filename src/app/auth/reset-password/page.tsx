import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";
import { getSession, homeForRole } from "@/lib/auth";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(homeForRole(session.role));
  const { token } = await searchParams;

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
              <h1 className="font-display text-2xl font-bold">Set a new password</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a password you haven&apos;t used before.
              </p>
            </div>

            {token ? (
              <ResetPasswordForm token={token} />
            ) : (
              <div className="space-y-4">
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
                >
                  This reset link is incomplete. Please request a new one.
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/auth/forgot-password">Request a new link</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
