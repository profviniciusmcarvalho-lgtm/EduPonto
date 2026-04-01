import React from 'react';
import { GraduationCap, Clock } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  variant?: 'default' | 'white' | 'slate';
}

export function Logo({ className, size = 'md', showText = true, variant = 'default' }: LogoProps) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-10 w-10',
    lg: 'h-16 w-16',
    xl: 'h-24 w-24',
  };

  const iconSizes = {
    sm: 14,
    md: 20,
    lg: 32,
    xl: 48,
  };

  const textClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-6xl',
  };

  const colorClasses = {
    default: 'text-blue-600 dark:text-blue-400',
    white: 'text-white',
    slate: 'text-slate-900 dark:text-slate-100',
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn(
        "relative rounded-xl flex items-center justify-center shadow-sm border transition-all duration-500 hover:rotate-6 hover:scale-105",
        sizeClasses[size],
        variant === 'white' 
          ? "bg-white/10 border-white/20" 
          : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 shadow-slate-200/50 dark:shadow-none"
      )}>
        <div className="relative">
          <Clock size={iconSizes[size]} className={cn("animate-pulse-slow", colorClasses[variant])} />
          <div className={cn(
            "absolute -top-1/2 -right-1/2 rotate-12 drop-shadow-sm",
            colorClasses[variant]
          )}>
            <GraduationCap size={iconSizes[size] * 0.8} />
          </div>
        </div>
      </div>
      
      {showText && (
        <div className="flex flex-col">
          <span className={cn(
            "font-black leading-none tracking-tight",
            textClasses[size],
            colorClasses[variant]
          )}>
            EduPonto
          </span>
          {size !== 'sm' && (
            <span className={cn(
              "text-[10px] uppercase font-bold tracking-[0.3em] mt-1",
              variant === 'white' ? "text-white/60" : "text-slate-400 dark:text-slate-500"
            )}>
              Gestão Escolar
            </span>
          )}
        </div>
      )}
    </div>
  );
}
