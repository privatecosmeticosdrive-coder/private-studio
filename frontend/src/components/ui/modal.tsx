import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** largura do painel */
  size?: 'sm' | 'md' | 'lg';
}

const LARGURAS = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

/**
 * Modal acessivel sem dependencias externas: portal, ESC para fechar,
 * clique no backdrop fecha, trava o scroll do body e foca o painel ao abrir.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const painelRef = React.useRef<HTMLDivElement>(null);
  const tituloId = React.useId();
  const descId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    painelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflowAnterior;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      aria-describedby={description ? descId : undefined}
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[1px] animate-fade-rise"
        onClick={onClose}
        aria-hidden
      />
      {/* painel */}
      <div
        ref={painelRef}
        tabIndex={-1}
        className={cn(
          'relative z-10 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg outline-none',
          'animate-fade-rise',
          LARGURAS[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="space-y-1">
            <h2 id={tituloId} className="font-display text-h3 text-ink">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-md text-warm-500 transition-colors hover:bg-warm-100 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-border bg-sand/40 p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
