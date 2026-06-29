import Link from "next/link";
import { redirect } from "next/navigation";
import { Home, ArrowLeft } from "lucide-react";
import { getSession, homeForRole } from "@/lib/auth";
import { LoginForm } from "@/components/forms/login-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(homeForRole(session.role));
  const { next } = await searchParams;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-background to-sand-50 px-4 py-12">
      <div className="absolute -left-24 top-10 size-72 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="absolute -right-24 bottom-10 size-72 rounded-full bg-sand-200/40 blur-3xl" />

      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" /> Back to home
        </Link>

        <Card className="border-brand-100/70 shadow-xl">
          <CardContent className="p-7">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-2xl gradient-accent text-white shadow-md shadow-sand-400/30">
                <Home className="size-6" />
              </div>
              <h1 className="font-display text-2xl font-bold">Welcome back</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in to your Ivy House account
              </p>
            </div>

            <LoginForm next={next} />

            <div className="mt-6 rounded-xl bg-muted/60 p-3.5 text-xs text-muted-foreground">
              <p className="mb-1.5 font-semibold text-foreground">Demo accounts</p>
              <ul className="space-y-0.5">
                <li>Owner — owner@ivyhouse.local / owner123</li>
                <li>Student — student@ivyhouse.local / student123</li>
                <li>Caretaker — caretaker@ivyhouse.local / caretaker123</li>
              </ul>
            </div>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don&apos;t have a room yet?{" "}
              <Link href="/book" className="font-semibold text-primary hover:underline">
                Apply now
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
