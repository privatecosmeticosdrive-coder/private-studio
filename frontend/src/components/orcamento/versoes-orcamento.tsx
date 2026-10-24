import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusOrcamentoBadge } from '@/components/ui/status-badge';
import { brl, cn } from '@/lib/utils';
import type { OrcamentoDetalhe } from '@/lib/types';

const STATUS_PROPOSTA: Record<string, { rotulo: string; variant: 'gold' | 'success' | 'neutral' }> = {
  emitida: { rotulo: 'Emitida', variant: 'gold' },
  assinada: { rotulo: 'Assinada', variant: 'success' },
  cancelada: { rotulo: 'Cancelada', variant: 'neutral' },
};

/** Versões da família do orçamento (10/26) e propostas comerciais em que ele aparece. */
export function VersoesOrcamento({ orc }: { orc: OrcamentoDetalhe }) {
  const temVersoes = orc.versoes.length > 1;
  if (!temVersoes && !orc.propostas.length) return null;
  return (
    <Card className="p-6">
      <div className="grid gap-6 md:grid-cols-2">
        {temVersoes && (
          <div>
            <h2 className="mb-3 font-display text-h3 text-ink">Versões</h2>
            <ul className="space-y-1.5">
              {orc.versoes.map((v) => (
                <li key={v.id} className={cn('flex flex-wrap items-center gap-2 text-sm', v.excluido_em && 'opacity-50')}>
                  {v.id === orc.id ? (
                    <span className="font-semibold text-ink">
                      v{v.versao} · #{v.numero}
                    </span>
                  ) : (
                    <Link to={`/orcamentos/${v.id}`} className="font-medium text-ink underline-offset-2 hover:underline">
                      v{v.versao} · #{v.numero}
                    </Link>
                  )}
                  <StatusOrcamentoBadge status={v.status} />
                  {v.ajuste_fac && <Badge variant="gold">FAC</Badge>}
                  {v.preco_sipi != null && <span className="tnum text-warm-600">{brl(v.preco_sipi)} s/ IPI</span>}
                  {v.excluido_em && <span className="text-caption text-warm-500">excluída</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {orc.propostas.length > 0 && (
          <div>
            <h2 className="mb-3 font-display text-h3 text-ink">Propostas comerciais</h2>
            <ul className="space-y-1.5">
              {orc.propostas.map((p) => {
                const st = STATUS_PROPOSTA[p.status] ?? { rotulo: p.status, variant: 'neutral' as const };
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Link
                      to={orc.cliente_id ? `/clientes/${orc.cliente_id}?aba=propostas` : '#'}
                      className="font-medium text-ink underline-offset-2 hover:underline"
                    >
                      Nº {p.numero}
                    </Link>
                    <Badge variant={st.variant}>{st.rotulo}</Badge>
                    <span className="text-caption text-warm-600">{new Date(p.emitida_em).toLocaleDateString('pt-BR')}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
