"use client";

import { cn } from "@/lib/utils";

/** Shared form primitives for the admin entry form - match the token system (border/surface/fg)
 *  and work in light + dark. Kept presentational so the form composes them. */

const baseField =
  "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg " +
  "placeholder:text-muted focus:border-confident focus:outline-none focus:ring-2 " +
  "focus:ring-confident/30 disabled:opacity-50";

export function Label({
  children,
  htmlFor,
  className,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("mb-1 block text-xs font-medium tracking-wide text-secondary", className)}
    >
      {children}
    </label>
  );
}

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseField, className)} {...props} />;
}

export function NumberInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      inputMode="numeric"
      className={cn(baseField, "tnum", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(baseField, "appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(baseField, "min-h-[64px] resize-y", className)} {...props} />;
}

export function Checkbox({
  label,
  hint,
  className,
  ...props
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5", className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--confident)]"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}
