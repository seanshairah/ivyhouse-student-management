import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "@/components/forms/change-password-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Set your password" };

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { mustChangePassword: true },
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-background to-sand-50 px-4 py-12">
      <div className="absolute -left-24 top-10 size-72 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="absolute -right-24 bottom-10 size-72 rounded-full bg-sand-200/40 blur-3xl" />

      <div className="relative w-full max-w-md">
        <Card className="border-brand-100/70 shadow-xl">
          <CardContent className="p-7">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-2xl gradient-accent text-white shadow-md shadow-sand-400/30">
                <KeyRound className="size-6" />
              </div>
              <h1 className="font-display text-2xl font-bold">
                {user?.mustChangePassword ? "Set your new password" : "Change your password"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {user?.mustChangePassword
                  ? "For your security, please replace the temporary password you were sent before continuing."
                  : "Update the password you use to sign in to Ivy House."}
              </p>
            </div>

            <ChangePasswordForm
              currentLabel={
                user?.mustChangePassword ? "Temporary password" : "Current password"
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
