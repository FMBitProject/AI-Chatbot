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
    <svg width={px} height={px} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="48" height="48" rx="12" fill={variant === "white" ? "white" : "url(#grad)"}/>
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB"/>
          <stop offset="1" stopColor="#7C3AED"/>
        </linearGradient>
      </defs>
      <path d="M14 18C14 15.8 15.8 14 18 14H30C32.2 14 34 15.8 34 18V26C34 28.2 32.2 30 30 30H27L24 34L21 30H18C15.8 30 14 28.2 14 26V18Z"
        fill={variant === "white" ? "url(#grad2)" : "white"} fillOpacity={variant === "white" ? 1 : 0.95}/>
      <defs>
        <linearGradient id="grad2" x1="14" y1="14" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB"/>
          <stop offset="1" stopColor="#7C3AED"/>
        </linearGradient>
      </defs>
      <circle cx="20" cy="22" r="1.5" fill={variant === "white" ? "white" : "#2563EB"}/>
      <circle cx="24" cy="22" r="1.5" fill={variant === "white" ? "white" : "#2563EB"}/>
      <circle cx="28" cy="22" r="1.5" fill={variant === "white" ? "white" : "#2563EB"}/>
      <path d="M38 10L40 8M38 8L40 10" stroke={variant === "white" ? "white" : "#F59E0B"} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M10 36L12 34M10 34L12 36" stroke={variant === "white" ? "white" : "#10B981"} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="39" cy="20" r="1.5" fill={variant === "white" ? "white" : "#F59E0B"} fillOpacity="0.8"/>
      <circle cx="9" cy="28" r="1" fill={variant === "white" ? "white" : "#10B981"} fillOpacity="0.8"/>
    </svg>
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
