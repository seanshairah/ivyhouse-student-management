import * as React from "react";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { FloatingBookCta } from "@/components/marketing/floating-cta";

/** Server shell wrapping marketing pages with nav, footer and floating CTA. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <FloatingBookCta />
    </div>
  );
}
