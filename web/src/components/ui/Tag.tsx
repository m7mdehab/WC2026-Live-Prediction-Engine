import { cn } from "@/lib/utils";

type Variant = "neutral" | "up" | "down" | "upset" | "confident" | "gold";

const VARIANTS: Record<Variant, string> = {
  neutral: "bg-elevated text-secondary",
  up: "bg-up-bg text-up",
  down: "bg-down-bg text-down",
  upset: "bg-upset-bg text-upset",
  confident: "bg-confident/10 text-confident",
  gold: "bg-gold/15 text-gold",
};

export function Tag({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        VARIANTS[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
