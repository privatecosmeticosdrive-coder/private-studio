import { Badge, type BadgeProps } from '@/components/ui/badge';
import { STATUS_ORCAMENTO_LABEL } from '@/lib/types';

type Variant = NonNullable<BadgeProps['variant']>;

/** Status do orçamento (Doc 2c). */
export function StatusOrcamentoBadge({ status }: { status: string }) {
  const mapa: Record<string, Variant> = {
    rascunho: 'neutral',
    aprovado_interno: 'info',
    enviado: 'info',
    aprovado_cliente: 'success',
    recusado: 'error',
    em_amostragem: 'warning',
    em_producao: 'info',
    concluido: 'success',
    rejeitado: 'error',
    arquivado: 'neutral',
  };
  return <Badge variant={mapa[status] ?? 'neutral'}>{STATUS_ORCAMENTO_LABEL[status] ?? status}</Badge>;
}

/** Status de formula: validada / rascunho / arquivada. */
export function StatusFormulaBadge({ status }: { status: string }) {
  const mapa: Record<string, { v: Variant; label: string }> = {
    validada: { v: 'success', label: 'Validada' },
    rascunho: { v: 'warning', label: 'Rascunho' },
    arquivada: { v: 'neutral', label: 'Arquivada' },
  };
  const { v, label } = mapa[status] ?? { v: 'neutral' as Variant, label: status };
  return <Badge variant={v}>{label}</Badge>;
}

/** Origem da formula: banco original / IA / P&D manual. */
export function OrigemBadge({ origem }: { origem: string }) {
  const mapa: Record<string, { v: Variant; label: string }> = {
    banco_original: { v: 'neutral', label: 'Banco original' },
    ia_gerada: { v: 'gold', label: 'IA' },
    pd_manual: { v: 'info', label: 'P&D' },
  };
  const { v, label } = mapa[origem] ?? { v: 'neutral' as Variant, label: origem };
  return <Badge variant={v}>{label}</Badge>;
}

/** Preco cotado (success) vs estimado/chutado (warning). */
export function PrecoBadge({ estimado, semPreco }: { estimado: boolean; semPreco?: boolean }) {
  if (semPreco) return <Badge variant="neutral">Sem preço</Badge>;
  return estimado ? (
    <Badge variant="warning">Estimado</Badge>
  ) : (
    <Badge variant="success">Cotado</Badge>
  );
}

/** Cotacao vencida (> 12 meses ou sem data). */
export function VencidaBadge() {
  return <Badge variant="error">Vencida</Badge>;
}
