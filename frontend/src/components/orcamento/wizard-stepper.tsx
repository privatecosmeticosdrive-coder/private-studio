import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EtapaDef {
  id: number;
  titulo: string;
}

interface WizardStepperProps {
  etapas: EtapaDef[];
  atual: number;
  /** Permite voltar clicando em etapas já visitadas. */
  onIr?: (id: number) => void;
}

/** Indicador de progresso das etapas do wizard (tokens Atelier Técnico). */
export function WizardStepper({ etapas, atual, onIr }: WizardStepperProps) {
  return (
    <ol className="flex items-center gap-1 sm:gap-2">
      {etapas.map((etapa, idx) => {
        const concluida = etapa.id < atual;
        const ativa = etapa.id === atual;
        const navegavel = !!onIr && etapa.id < atual;
        return (
          <li key={etapa.id} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <button
              type="button"
              disabled={!navegavel}
              onClick={() => navegavel && onIr?.(etapa.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-1 py-1 text-left transition-colors',
                navegavel ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-colors',
                  concluida && 'border-gold-500 bg-gold-500 text-ink',
                  ativa && 'border-ink bg-ink text-sand',
                  !concluida && !ativa && 'border-border bg-surface text-warm-500',
                )}
              >
                {concluida ? <Check className="size-4" /> : etapa.id}
              </span>
              {/* no celular só a bolinha numerada; o título da etapa ativa aparece ao lado */}
              <span className={cn('flex-col', ativa ? 'flex' : 'hidden sm:flex')}>
                <span className="hidden text-caption uppercase tracking-wide text-warm-500 sm:block">
                  Etapa {etapa.id}
                </span>
                <span
                  className={cn(
                    'text-sm font-medium',
                    ativa || concluida ? 'text-ink' : 'text-warm-500',
                  )}
                >
                  {etapa.titulo}
                </span>
              </span>
            </button>
            {idx < etapas.length - 1 && (
              <span
                className={cn(
                  'h-px min-w-2 flex-1 transition-colors',
                  etapa.id < atual ? 'bg-gold-500' : 'bg-border',
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
