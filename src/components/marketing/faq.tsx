"use client";

import { motion } from "framer-motion";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { faqs } from "@/data/houses";
import { fadeUp, revealViewport } from "@/lib/animation-config";

export function Faq() {
  return (
    <section
      id="faqs"
      className="border-t border-border scroll-mt-24 py-20 sm:py-28"
    >
      <div className="container grid gap-12 lg:grid-cols-[1fr_1.4fr]">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
          className="lg:sticky lg:top-28 lg:self-start"
        >
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            FAQs
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight sm:text-5xl">
            Questions, answered.
          </h2>
          <p className="mt-4 max-w-sm text-muted-foreground">
            Everything you need to know before you book.
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={revealViewport}
        >
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
