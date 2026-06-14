import { useQuery } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCan } from '@/auth/use-can';
import type { Cliente } from '@/lib/types';
import { clientesApi } from '@/lib/services/clientes';

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

interface ClienteDetailModalProps {
  open: boolean;
  onClose: () => void;
  cliente: Cliente | null;
  onEditar: (c: Cliente) => void;
  onExcluir: (c: Cliente) => void;
}

export function ClienteDetailModal({
  open,
  onClose,
  cliente,
  onEditar,
  onExcluir,
}: ClienteDetailModalProps) {
  const can = useCan();
  const id = cliente?.id;

  const detalhe = useQuery({
    queryKey: ['clientes', id],
    queryFn: () => clientesApi.obter(id!),
    enabled: open && id != null,
  });

  const orcamentos = detalhe.data?.orcamentos ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={cliente?.nome ?? 'Cliente'}
      description={cliente?.cnpj ?? undefined}
      footer={
        cliente && (
          <>
            {can('cliente:remover') && (
              <Button variant="destructive" onClick={() => onExcluir(cliente)}>
                <Trash2 className="size-4" /> Excluir
              </Button>
            )}
            {can('cliente:escrever') && (
              <Button onClick={() => onEditar(cliente)}>
                <Pencil className="size-4" /> Editar
              </Button>
            )}
          </>
        )
      }
    >
      {cliente && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Campo label="CNPJ">{cliente.cnpj || '—'}</Campo>
            <Campo label="E-mail">{cliente.email || '—'}</Campo>
            <Campo label="Telefone">{cliente.telefone || '—'}</Campo>
          </div>

          {cliente.observacoes && (
            <div className="rounded-md bg-sand/60 px-3 py-2 text-sm text-warm-700">
              {cliente.observacoes}
            </div>
          )}

          <section className="space-y-2">
            <h3 className="font-display text-h3 text-ink">Orçamentos vinculados</h3>
            {detalhe.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : orcamentos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum orçamento para este cliente.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {orcamentos.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-ink">
                      <span className="font-mono text-warm-600">#{o.numero}</span>{' '}
                      {o.produto || 'Sem produto'}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-caption text-warm-500 tnum">{fmtData(o.created_at)}</span>
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
