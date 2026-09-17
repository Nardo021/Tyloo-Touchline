import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "warning";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground border-primary hover:bg-pressed disabled:bg-border disabled:text-text-muted disabled:border-border",
  secondary:
    "bg-surface text-text border-border hover:bg-background disabled:text-text-muted",
  danger:
    "bg-danger text-danger-foreground border-danger hover:opacity-90 disabled:bg-border disabled:text-text-muted disabled:border-border",
  ghost:
    "bg-transparent text-text border-transparent hover:bg-background",
  warning:
    "bg-surface text-text border-warning hover:bg-background",
};

export function Button({
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border-2 px-4 py-3 text-base font-semibold tracking-wide",
        "active:scale-[0.96] motion-safe:transition-transform disabled:pointer-events-none disabled:active:scale-100",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
