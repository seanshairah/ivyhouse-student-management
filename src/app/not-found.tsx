import Link from "next/link";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-50 via-background to-sand-50 px-4 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl gradient-brand text-white shadow-md">
        <Home className="size-7" />
      </div>
      <p className="font-display text-6xl font-bold gradient-text">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold">Page not found</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild variant="brand">
          <Link href="/">Back home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/book">Book a room</Link>
        </Button>
      </div>
    </div>
  );
}
