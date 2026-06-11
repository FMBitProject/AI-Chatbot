import Image from "next/image";
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
      className={cn(variant === "white" && "brightness-0 invert", className)}
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
