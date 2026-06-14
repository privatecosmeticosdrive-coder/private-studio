import { useQuery } from '@tanstack/react-query';
import { Pencil, Tag } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { PrecoBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { PriceHistoryChart } from '@/components/data/price-history-chart';
import { brl } from '@/lib/utils';
import { useCan } from '@/auth/use-can';
import { TIPO_EMBALAGEM_LABEL, type Embalagem } from '@/lib/types';
import { embalagensApi } from '@/lib/services/embalagens';

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-caption uppercase tracking-wide text-warm-500">{label}</p>
      <p className="text-sm text-ink">{children}</p>
    </div>
  );
}

interface EmbalagemDetailModalProps {
  open: boolean;
  onClose: () => void;
  embalagem: Embalagem | null;
  onEditar: (e: Embalagem) => void;
  onAtualizarPreco: (e: Embalagem) => void;
}

export function EmbalagemDetailModal({
  open,
  onClose,
  embalagem,
  onEditar,
  onAtualizarPreco,
}: EmbalagemDetailModalProps) {
  const can = useCan();
  const id = embalagem?.id;

  const historico = useQuery({
    queryKey: ['embalagens', id, 'historico'],
    queryFn: () => embalagensApi.historico(id!),
    enabled: open && id != null,
  });
  const orcamentos = useQuery({
    queryKey: ['embalagens', id, 'orcamentos'],
    queryFn: () => embalagensApi.orcamentos(id!),
    enabled: open && id != null,
  });

  const semPreco = embalagem?.preco_un_brl == null || embalagem?.preco_un_brl === '';
  const pontos = (historico.data ?? [])
    .map((h) => ({ data: h.data_cotacao, preco: Number(h.preco_un_brl) }))
    .reverse();

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={embalagem?.nome ?? 'Embalagem'}
      description={
        embalagem
          ? `${TIPO_EMBALAGEM_LABEL[embalagem.tipo] ?? embalagem.tipo}${embalagem.codigo ? ` · ${embalagem.codigo}` : ''}`
          : undefined
      }
      footer={
        embalagem && (
          <>
            {can('embalagem:atualizar-preco') && (
              <Button variant="outline" onClick={() => onAtualizarPreco(embalagem)}>
                <Tag className="size-4" /> Atualizar preço
              </Button>
            )}
            {can('embalagem:escrever') && (
              <Button onClick={() => onEditar(embalagem)}>
                <Pencil className="size-4" /> Editar
              </Button>
            )}
          </>
        )
      }
    >
      {embalagem && (
        <div className="space-y-6">
          {/* Resumo */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Campo label="Preço/un">
              <span className="inline-flex items-center gap-2">
                <span className="font-medium tnum">{brl(embalagem.preco_un_brl)}</span>
                <PrecoBadge estimado={embalagem.preco_estimado} semPreco={semPreco} />
              </span>
            </Campo>
            <Campo label="Volume">
              {embalagem.volume_ml != null && embalagem.volume_ml !== ''
                ? `${embalagem.volume_ml} mL`
                : '—'}
            </Campo>
            <Campo label="Material">{embalagem.material || '—'}</Campo>
            <Campo label="Cor">{embalagem.cor || '—'}</Campo>
            <Campo label="Fornecedor">{embalagem.fornecedor || '—'}</Campo>
            <Campo label="Prazo de entrega">{embalagem.prazo_entrega || '—'}</Campo>
            <Campo label="Última cotação">{fmtData(embalagem.data_cotacao)}</Campo>
            <Campo label="Situação">
              {embalagem.ativo ? (
                <Badge variant="success">Ativa</Badge>
              ) : (
                <Badge variant="neutral">Inativa</Badge>
              )}
            </Campo>
          </div>

          {embalagem.observacoes && (
            <div className="rounded-md bg-sand/60 px-3 py-2 text-sm text-warm-700">
              {embalagem.observacoes}
            </div>
          )}

          {/* Historico de preco */}
          <section className="space-y-2">
            <h3 className="font-display text-h3 text-ink">Histórico de preço</h3>
            {historico.isLoading ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Spinner /> <span className="ml-2 text-sm">Carregando…</span>
              </div>
            ) : (
              <PriceHistoryChart pontos={pontos} unidade="/un" />
            )}
          </section>

          {/* Orcamentos que usam */}
          <section className="space-y-2">
            <h3 className="font-display text-h3 text-ink">Orçamentos que usam</h3>
            {orcamentos.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (orcamentos.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum orçamento utiliza esta embalagem.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {(orcamentos.data ?? []).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-ink">
                      <span className="font-mono text-warm-600">#{o.numero}</span>{' '}
                      {o.produto || 'Sem produto'}
                    </span>
                    <span className="flex items-center gap-3">
                      {o.preco_cipi != null && (
                        <span className="tnum text-warm-700">{brl(o.preco_cipi)}</span>
                      )}
                      <Badge variant="neutral">{o.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
