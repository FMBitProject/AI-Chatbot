import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "white";
}

export function LogoIcon({ className, size = "md", variant = "default" }: LogoProps) {
  const sizes = { sm: 28, md: 36, lg: 48 };
  const px = sizes[size];
  return (
    <Image
      src="/web-app-manifest-192x192.png"
      alt="IntelliBase"
      width={px}
      height={px}
      className={cn(className)}
    />
  );
}

export function LogoFull({ className, size = "md", variant = "default" }: LogoProps) {
  const textSizes = { sm: "text-base", md: "text-xl", lg: "text-2xl" };
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoIcon size={size} variant={variant} />
      <div>
        <span className={cn("font-bold tracking-tight leading-none", textSizes[size],
          variant === "white" ? "text-white" : "text-gray-900")}>
          IntelliBase
        </span>
        <span className={cn("font-bold tracking-tight leading-none", textSizes[size],
          variant === "white" ? "text-blue-200" : "text-blue-600")}> AI</span>
      </div>
    </div>
  );
}

/**
 * The logo as the way home — what a visitor expects clicking it to do.
 *
 * A component rather than three copies of the same anchor, because the parts
 * that are easy to forget are the parts that are not the href: the accessible
 * name (the anchor's only text is an image and two spans, so a screen reader
 * announces nothing useful without one), and a visible focus ring (it is a
 * link now, so it has to be reachable and visible from the keyboard).
 *
 * Wraps the whole wordmark, not just the icon — the text is the bigger target
 * and the one most people actually aim for.
 *
 * Deliberately not used everywhere the logo appears. It belongs on pages that
 * offer no other way back; pages that already carry an explicit "Beranda" or
 * "Dashboard" button do not need a second, less obvious one, and a few pages
 * must not link at all — /maintenance would loop back through the middleware,
 * and /two-factor must not hand a half-authenticated visitor an exit.
 */
export function LogoHomeLink({
  className,
  size = "sm",
  variant = "default",
  lang = "id",
  href = "/",
}: LogoProps & { lang?: "id" | "en"; href?: string }) {
  return (
    <Link
      href={href}
      aria-label={lang === "en" ? "IntelliBase AI — back to home" : "IntelliBase AI — kembali ke beranda"}
      className={cn(
        "rounded-md transition-opacity hover:opacity-80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2",
        className,
      )}
    >
      <LogoFull size={size} variant={variant} />
    </Link>
  );
}
