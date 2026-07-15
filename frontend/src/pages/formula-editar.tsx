import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { EditorComposicao } from '@/components/data/editor-composicao';
import { useCan } from '@/auth/use-can';
import { formulasApi } from '@/lib/services/formulas';

/**
 * P0-1 — Continuar edição de RASCUNHO: mesma versão, in-place (PATCH).
 * Validada é imutável (o backend barra; aqui nem renderiza o editor).
 */
export default function FormulaEditar() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const id = Number(params.id);
  const idValido = Number.isInteger(id) && id > 0;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['formulas', id],
    queryFn: () => formulasApi.obter(id),
    enabled: idValido && can('formula:escrever'),
  });

  const voltar = (
    <Link
      to={idValido ? `/formulas/${id}` : '/formulas'}
      className="inline-flex items-center gap-1.5 text-sm text-warm-600 transition-colors hover:text-ink"
    >
      <ArrowLeft className="size-4" /> Voltar
    </Link>
  );

  if (!can('formula:escrever')) {
    return (
      <div className="space-y-6">
        {voltar}
        <p className="text-sm text-muted-foreground">Você não tem permissão para editar fórmulas.</p>
      </div>
    );
  }
  if (!idValido) {
    return (
      <div className="space-y-6">
        {voltar}
        <p className="text-sm text-muted-foreground">Identificador de fórmula inválido.</p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="space-y-6">
        {voltar}
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Spinner /> <span className="text-sm">Carregando fórmula…</span>
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="space-y-6">
        {voltar}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="grid size-12 place-items-center rounded-lg bg-error-soft text-error">
              <AlertTriangle className="size-6" />
            </div>
            <p className="font-medium text-ink">Não foi possível carregar a fórmula</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate('/formulas')}>
                Voltar
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (data.status !== 'rascunho') {
    return (
      <div className="space-y-6">
        {voltar}
        <p className="text-sm text-muted-foreground">
          Só rascunhos são editáveis na mesma versão. Fórmula validada é imutável — crie uma nova
          versão a partir dela.
        </p>
      </div>
    );
  }

  return <EditorComposicao formula={data} modo="rascunho" />;
}
