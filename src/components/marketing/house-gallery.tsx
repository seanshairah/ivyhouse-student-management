"use client";

import * as React from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Elegant property gallery: a large lead image with a strip of selectable
 * thumbnails below. Falls back gracefully to a single image.
 */
export function HouseGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const reduce = useReducedMotion();
  const gallery = images.length > 0 ? images : [];
  const [active, setActive] = React.useState(0);

  if (gallery.length === 0) return null;

  return (
    <div className="space-y-3">
      <motion.div
        key={active}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.01 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative aspect-[16/10] w-full overflow-hidden rounded-3xl"
      >
        <Image
          src={gallery[active]}
          alt={`${alt} — photo ${active + 1}`}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 66vw"
          className="object-cover"
        />
      </motion.div>

      {gallery.length > 1 && (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
          {gallery.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View photo ${i + 1}`}
              aria-pressed={active === i}
              className={cn(
                "relative aspect-square w-full overflow-hidden rounded-xl ring-1 ring-inset transition-all",
                active === i
                  ? "ring-2 ring-foreground"
                  : "ring-border hover:ring-brand-300",
              )}
            >
              <Image
                src={src}
                alt={`${alt} thumbnail ${i + 1}`}
                fill
                sizes="120px"
                className={cn(
                  "object-cover transition-opacity",
                  active === i ? "opacity-100" : "opacity-80 hover:opacity-100",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
