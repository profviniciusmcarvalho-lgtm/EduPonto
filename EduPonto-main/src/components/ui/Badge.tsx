import * as React from "react";
import { cn } from "@/src/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  className?: string;
  children?: React.ReactNode;
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-transparent bg-slate-900 dark:bg-slate-50 text-slate-50 dark:text-slate-900 hover:bg-slate-900/80 dark:hover:bg-slate-50/80",
    secondary: "border-transparent bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80",
    destructive: "border-transparent bg-red-500 dark:bg-red-900 text-slate-50 dark:text-slate-100 hover:bg-red-500/80 dark:hover:bg-red-900/80",
    outline: "text-slate-950 dark:text-slate-50 border border-slate-200 dark:border-slate-800",
    success: "border-transparent bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100/80 dark:hover:bg-green-900/40",
    warning: "border-transparent bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100/80 dark:hover:bg-amber-900/40",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
