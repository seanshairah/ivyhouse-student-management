import Link from "next/link";
import Image from "next/image";
import { Mail, Phone, MapPin, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONTACT_IMG =
  "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80";

const DETAILS = [
  {
    icon: Mail,
    label: "Email",
    value: "hello@ivyhouse.co.zw",
    hint: "We reply within a day",
  },
  {
    icon: Phone,
    label: "Phone / WhatsApp",
    value: "+263 77 000 0001",
    hint: "Mon–Sat, 8am–6pm",
  },
  {
    icon: MapPin,
    label: "Location",
    value: "Off Magamba Way, Chinhoyi",
    hint: "6 min walk to CUT main campus",
  },
  {
    icon: Clock,
    label: "Office hours",
    value: "Mon–Fri 8:00–17:00",
    hint: "Weekend viewings on request",
  },
];

export function Contact() {
  return (
    <section
      id="contact"
      className="border-t border-border scroll-mt-24 py-20 sm:py-28"
    >
      <div className="container grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Contact
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight sm:text-5xl">
            Ready when you are.
          </h2>
          <p className="mt-4 max-w-md text-muted-foreground">
            Have a question or want to arrange a viewing? Reach out, or skip
            ahead and book your room online.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" variant="accent" className="rounded-full">
              <Link href="/book">
                Book a room
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link href="/houses">View the house</Link>
            </Button>
          </div>

          <dl className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2">
            {DETAILS.map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.label} className="border-t border-border pt-4">
                  <dt className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <Icon className="size-4 text-sand-400" />
                    {d.label}
                  </dt>
                  <dd className="mt-2 font-medium">{d.value}</dd>
                  <dd className="text-xs text-muted-foreground">{d.hint}</dd>
                </div>
              );
            })}
          </dl>
        </div>

        <div className="relative order-first aspect-[4/5] w-full overflow-hidden rounded-3xl lg:order-none">
          <Image
            src={CONTACT_IMG}
            alt="Exterior of a modern residence"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
