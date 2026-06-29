/**
 * ─────────────────────────────────────────────────────────────
 * Animation System Configuration
 * Inspiration: "Animmaster Lib" — adapted, customized, and made
 * accessible/performance-first for this student housing platform.
 *
 * This central config keeps motion consistent across the marketing
 * site instead of hard-coding values in each component. Components
 * import the typed Framer Motion variants below.
 * ─────────────────────────────────────────────────────────────
 */

import type { Variants } from "framer-motion";

export const animationSystem = {
  inspiration: "Animmaster Lib",
  preferredLibraries: ["Framer Motion", "CSS transitions"],
  optionalLibraries: ["GSAP only if truly needed"],
  globalRules: {
    performanceFirst: true,
    respectReducedMotion: true,
    mobileOptimized: true,
    avoidExcessiveMotion: true,
    animationsMustSupportUX: true,
    noAnimationShouldBlockUsability: true,
  },
  sections: {
    hero: {
      animationType: "text-reveal-and-soft-background-motion",
      trigger: "page-load",
      duration: "700ms",
      easing: "ease-out",
      effects: [
        "headline fades upward",
        "CTA buttons slide in subtly",
        "background gradient blobs move slowly",
        "house preview card floats gently",
      ],
      mobileBehavior: "reduce movement and keep animations shorter",
      reducedMotionFallback: "simple fade-in",
    },
    houseShowcase: {
      animationType: "scroll-reveal-card-stack",
      trigger: "on-scroll",
      duration: "500ms",
      stagger: "120ms",
      effects: [
        "cards fade in",
        "cards rise from 24px below",
        "hover lift",
        "room availability badge pulses subtly",
      ],
      mobileBehavior: "single-column reveal with minimal movement",
      reducedMotionFallback: "static cards with opacity transition",
    },
    houseComparison: {
      animationType: "interactive-comparison-cards",
      trigger: "scroll-and-hover",
      duration: "500ms",
      effects: [
        "comparison cards reveal side by side",
        "hover highlights selected house",
        "amenity differences animate softly",
      ],
      mobileBehavior: "stacked comparison cards",
      reducedMotionFallback: "static comparison layout",
    },
    howItWorks: {
      animationType: "interactive-timeline",
      trigger: "on-scroll",
      duration: "600ms",
      effects: [
        "timeline line draws vertically",
        "steps reveal one by one",
        "active step highlights on hover",
      ],
      mobileBehavior: "vertical step cards",
      reducedMotionFallback: "static timeline",
    },
    bookingForm: {
      animationType: "multi-step-form-microinteractions",
      trigger: "user-interaction",
      effects: [
        "step transitions slide softly",
        "selected room card scales slightly",
        "validation errors shake gently",
        "success state uses checkmark animation",
      ],
      mobileBehavior: "short transitions with no layout jump",
      reducedMotionFallback: "instant step change with fade",
    },
    faq: {
      animationType: "accordion-expand-collapse",
      trigger: "click",
      duration: "250ms",
      effects: [
        "answer height animates smoothly",
        "icon rotates",
        "active item gets subtle background",
      ],
      mobileBehavior: "same behavior but compact",
      reducedMotionFallback: "instant open/close",
    },
  },
} as const;

// ── Reusable Framer Motion variants ───────────────────────────
const easeOut = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: easeOut, delay: i * 0.08 },
  }),
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6, ease: easeOut } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: easeOut } },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -28 },
  show: { opacity: 1, x: 0, transition: { duration: 0.6, ease: easeOut } },
};

export const shake: Variants = {
  shake: {
    x: [0, -6, 6, -4, 4, 0],
    transition: { duration: 0.4 },
  },
};

/** Standard viewport options for scroll-reveal sections. */
export const revealViewport = { once: true, amount: 0.2 } as const;
