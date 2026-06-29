"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mobile-only floating "Book a room" button, bottom-center. Hides on scroll up. */
export function FloatingBookCta() {
  const [visible, setVisible] = React.useState(false);
  const lastY = React.useRef(0);

  React.useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      // Hide near the very top (hero has its own CTA) and near the bottom
      // (footer/contact have their own CTAs) so it never overlaps them.
      const nearBottom =
        window.innerHeight + y > document.body.scrollHeight - 560;
      if (y < 240 || nearBottom) setVisible(false);
      else setVisible(y > lastY.current);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <Link
      href="/book"
      aria-label="Book a room"
      className={cn(
        // Compact bottom-right pill (not full-width) so it doesn't sit on top of
        // content buttons like "View house" / "Book" and block their taps.
        "fixed bottom-5 right-4 z-40 inline-flex items-center justify-center gap-2 rounded-full bg-sand-400 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sand-400/30 transition-all duration-300 hover:bg-sand-500 lg:hidden",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-24 opacity-0",
      )}
    >
      Book a room
      <ArrowRight className="size-4" />
    </Link>
  );
}
