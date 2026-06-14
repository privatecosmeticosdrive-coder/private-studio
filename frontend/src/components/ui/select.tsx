import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Select nativo estilizado nos tokens Atelier Tecnico. */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'flex h-10 w-full appearance-none rounded-md border border-border bg-surface px-3 py-2 pr-9 text-sm text-ink',
          'transition-colors focus-visible:outline-none focus-visible:border-gold-500 focus-visible:ring-2 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-warm-500" />
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };
