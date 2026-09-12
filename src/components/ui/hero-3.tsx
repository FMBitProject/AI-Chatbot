"use client";

import React, { useSyncExternalStore } from "react";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const getReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;
// Keep SSR and hydration static until the browser preference is available.
const getServerReducedMotion = () => true;

// Props interface for the component
interface AnimatedMarqueeHeroProps {
  tagline: React.ReactNode;
  title: React.ReactNode;
  description: string;
  ctaText: string;
  /** Where the CTA button navigates. The upstream component shipped a button
   *  that did nothing; on a landing page whose whole job is the click, the CTA
   *  has to be a real link (and an <a>, so middle-click and "open in new tab"
   *  behave). */
  ctaHref: string;
  images: string[];
  /** Rendered under the CTA — the quiet second path (consultation link, the
   *  "no credit card" note). Optional so the component still works as the
   *  single-CTA hero it was written as. */
  footer?: React.ReactNode;
  /** Aspect ratio of one marquee card. Portrait (the 3/4 default) suits the
   *  lifestyle photography this layout was designed around; landscape product
   *  screenshots need overriding, or the crop cuts the screen in half. */
  cardAspectClassName?: string;
  className?: string;
}

// Animation variants for the text content. Typed as `Variants` rather than
// inferred: framer-motion's `type` is a union of string literals, and an
// untyped object literal widens it to `string`, which does not typecheck.
const FADE_IN_ANIMATION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 20 } },
};

// The main hero component
export const AnimatedMarqueeHero: React.FC<AnimatedMarqueeHeroProps> = ({
  tagline,
  title,
  description,
  ctaText,
  ctaHref,
  images,
  footer,
  cardAspectClassName = "aspect-[3/4]",
  className,
}) => {
  // Duplicate images for a seamless loop
  const duplicatedImages = [...images, ...images];

  // Subscribe directly: the installed Motion hook snapshots the preference.
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion, getReducedMotion, getServerReducedMotion
  );
  const marqueeAnimation = reduceMotion
    ? undefined
    : {
        x: ["-100%", "0%"],
        transition: { ease: "linear" as const, duration: 40, repeat: Infinity },
      };

  return (
    <section
      className={cn(
        // min-h-[100dvh], never h-screen: on iOS Safari the address bar is
        // counted in vh, so a full-height hero jumps by that bar height the
        // first time the visitor scrolls. Callers that size the section
        // themselves (the landing page does) override this.
        "relative w-full min-h-[100dvh] overflow-hidden bg-background flex flex-col items-center justify-center text-center px-4",
        className
      )}
    >
      <div className="z-10 flex flex-col items-center">
        {/* Tagline */}
        <motion.div
          initial={reduceMotion ? false : "hidden"}
          animate="show"
          variants={FADE_IN_ANIMATION_VARIANTS}
          className="mb-4 inline-block rounded-full border border-hairline bg-raised/60 px-4 py-1.5 text-sm font-medium text-stone-600 backdrop-blur-sm"
        >
          {tagline}
        </motion.div>

        {/* Main Title */}
        <motion.h1
          initial={reduceMotion ? false : "hidden"}
          animate="show"
          variants={{
            hidden: {},
            show: {
              transition: {
                staggerChildren: 0.1,
              },
            },
          }}
          className="text-4xl md:text-6xl font-semibold tracking-[-0.02em] leading-[1.12] text-stone-900"
        >
          {typeof title === "string" ? (
            title.split(" ").map((word, i) => (
              <motion.span
                key={i}
                variants={FADE_IN_ANIMATION_VARIANTS}
                className="inline-block"
              >
                {word}&nbsp;
              </motion.span>
            ))
          ) : (
            title
          )}
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={reduceMotion ? false : "hidden"}
          animate="show"
          variants={FADE_IN_ANIMATION_VARIANTS}
          transition={{ delay: 0.5 }}
          className="mt-6 max-w-2xl text-base md:text-lg text-stone-600 leading-relaxed"
        >
          {description}
        </motion.p>

        {/* Call to Action */}
        <motion.div
          initial={reduceMotion ? false : "hidden"}
          animate="show"
          variants={FADE_IN_ANIMATION_VARIANTS}
          transition={{ delay: 0.6 }}
          className="flex flex-col items-center"
        >
          {/* Teal, not the upstream red: brand colour is the one thing a
              drop-in hero can never bring with it. */}
          <motion.a
            href={ctaHref}
            whileHover={reduceMotion ? undefined : { scale: 1.05 }}
            whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-teal-700 px-8 py-3 font-semibold text-white shadow-lg transition-colors hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            {ctaText}
          </motion.a>
          {footer}
        </motion.div>
      </div>

      {/* Animated Image Marquee */}
      {/* A fixed band height, not the `h-1/3 md:h-2/5` this shipped with. The
          percentage only ever made sense against `h-screen`: the cards inside
          are a fixed h-48/h-64 regardless, so the fraction was never sizing
          anything visible — it just decided where the mask's fade landed. On a
          section sized by its content it also grows with the copy, which is how
          the band ends up climbing over the CTA on a longer headline. Fixed
          height means a caller can clear it with padding and know it stays
          cleared. */}
      <div className="pointer-events-none absolute bottom-0 left-0 w-full h-56 md:h-72 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]">
        <motion.div
          key={reduceMotion ? "static" : "animated"}
          className="flex"
          animate={marqueeAnimation}
        >
          {duplicatedImages.map((src, index) => (
            // The gap lives on the card (pr-4), not on the flex row (gap-4).
            // `x: -100%` is a percentage of the row's own width, so the loop is
            // only seamless when that width is exactly two copies of the image
            // set — a row gap adds one extra gap between the copies and the
            // seam walks visibly across the screen over a few cycles.
            <div key={index} className="h-48 md:h-64 flex-shrink-0 pr-4">
              {/* The rotation and the aspect box sit inside the padding, not on
                  it: `fill` stretches to the padding box, so an image on the
                  padded element would simply cover the gap it exists to make. */}
              <div
                className={cn("relative h-full", cardAspectClassName)}
                style={{ rotate: `${index % 2 === 0 ? -2 : 5}deg` }}
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 22rem, 16rem"
                  className="rounded-2xl object-cover shadow-md"
                />
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
