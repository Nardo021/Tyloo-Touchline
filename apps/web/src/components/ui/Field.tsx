import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2" data-invalid={error ? true : undefined}>
      <label htmlFor={htmlFor} className="text-base font-semibold">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-sm text-text-muted">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-[var(--radius-control)] border-2 border-border bg-surface px-3 text-base text-text",
        "placeholder:text-text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "min-h-11 w-full rounded-[var(--radius-control)] border-2 border-border bg-surface px-3 text-base text-text",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
