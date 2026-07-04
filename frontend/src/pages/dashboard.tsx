import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, FlaskConical, Send, TrendingUp, ListChecks, Inbox } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { StatusOrcamentoBadge } from '@/components/ui/status-badge';
import { useAuth } from '@/auth/auth-context';
import { STATUS_ORCAMENTO_LABEL } from '@/lib/types';
import { orcamentosApi } from '@/lib/services/orcamentos';
import { formulasApi } from '@/lib/services/formulas';
import { amostrasApi } from '@/lib/services/amostras';

// ---------------- helpers ----------------

/** "hoje" | "ontem" | "há N dias" | data pt-BR (compara à meia-noite local — sem off-by-one). */
function dataRelativa(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const zero = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((zero(new Date()) - zero(d)) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  return d.toLocaleDateString('pt-BR');
}

/** Últimos 12 meses (data local; new Date(y, m-n, 1) vira o ano corretamente). */
function ultimos12Meses(): { key: string; label: string }[] {
  const agora = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(agora.getFullYear(), agora.getMonth() - (11 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return { key, label: `${mes}/${String(d.getFullYear()).slice(2)}` };
  });
}

/** Barra horizontal CSS proporcional (decorativa — o número ao lado é a informação). */
function Barra({ valor, max }: { valor: number; max: number }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-warm-100" aria-hidden>
      <div className="h-full rounded-full bg-gold-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Estados padrão de card: loading (spinner) / erro explícito (nunca zero falso). */
function EstadoCard({ carregando, erro }: { carregando: boolean; erro: boolean }) {
  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-6 text-muted-foreground">
        <Spinner /> <span className="text-sm">Carregando…</span>
      </div>
    );
  }
  if (erro) {
    return <p className="py-6 text-sm text-error">Não foi possível carregar.</p>;
  }
  return null;
}

// ---------------- cards ----------------

function CardRecentes() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'orcamentos-recentes'],
    queryFn: () => orcamentosApi.listar({ pageSize: 5 }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4 text-gold-600" /> Orçamentos recentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EstadoCard carregando={isLoading} erro={isError} />
        {data && data.data.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">Sem dados.</p>
        )}
        {data && data.data.length > 0 && (
          <ul className="divide-y divide-border">
            {data.data.map((o) => (
              <li key={o.id}>
                <Link
                  to={`/orcamentos/${o.id}`}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-sand/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      <span className="tnum text-warm-500">#{o.numero}</span> {o.produto}
                    </p>
                    <p className="truncate text-caption text-warm-600">
                      {o.cliente?.nome ?? 'Sem cliente'} · {dataRelativa(o.created_at)}
                    </p>
                  </div>
                  <StatusOrcamentoBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CardVolumeMensal() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['orcamentos', 'stats'],
    queryFn: () => orcamentosApi.stats(),
  });

  const meses = ultimos12Meses();
  const porMes = new Map((data?.por_mes ?? []).map((m) => [m.mes, m.count]));
  const serie = meses.map((m) => ({ ...m, count: porMes.get(m.key) ?? 0 }));
  const max = Math.max(...serie.map((s) => s.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="size-4 text-gold-600" /> Volume por mês
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EstadoCard carregando={isLoading} erro={isError} />
        {data && data.por_mes.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">Sem dados nos últimos 12 meses.</p>
        )}
        {data && data.por_mes.length > 0 && (
          <ul className="space-y-1.5">
            {serie.map((s) => (
              <li key={s.key} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-caption text-warm-600">{s.label}</span>
                <Barra valor={s.count} max={max} />
                <span className="w-8 shrink-0 text-right text-sm text-ink tnum">{s.count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CardPorStatus() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['orcamentos', 'stats'],
    queryFn: () => orcamentosApi.stats(),
  });

  const itens = data?.por_status ?? [];
  const max = Math.max(...itens.map((s) => s.count), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-4 text-gold-600" /> Orçamentos por status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EstadoCard carregando={isLoading} erro={isError} />
        {data && itens.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">Sem dados.</p>
        )}
        {data && itens.length > 0 && (
          <ul className="space-y-1.5">
            {itens.map((s) => (
              <li key={s.status} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-caption text-warm-600">
                  {STATUS_ORCAMENTO_LABEL[s.status] ?? s.status}
                </span>
                <Barra valor={s.count} max={max} />
                <span className="w-8 shrink-0 text-right text-sm text-ink tnum">{s.count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CardPendentes() {
  const formulas = useQuery({
    queryKey: ['dashboard', 'formulas-rascunho'],
    queryFn: () => formulasApi.listar({ status: 'rascunho', pageSize: 1 }),
  });
  const amostras = useQuery({
    queryKey: ['dashboard', 'amostras-pipeline'],
    queryFn: () => amostrasApi.pipeline(),
  });

  const enviadas = amostras.data
    ? (amostras.data.grupos.find((g) => g.status === 'enviada')?.itens.length ?? 0)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="size-4 text-gold-600" /> Pendentes de aprovação
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <Link
            to="/formulas"
            className="rounded-lg border border-border p-4 transition-colors hover:bg-sand/60"
          >
            <p className="flex items-center gap-1.5 text-caption uppercase tracking-wide text-warm-500">
              <FlaskConical className="size-3.5" /> Fórmulas em rascunho
            </p>
            {formulas.isLoading && <Spinner className="mt-2" />}
            {formulas.isError && <p className="mt-2 text-sm text-error">Erro ao carregar.</p>}
            {formulas.data && (
              <p className="mt-1 font-display text-h1 text-ink tnum">{formulas.data.total}</p>
            )}
          </Link>
          <Link
            to="/amostras"
            className="rounded-lg border border-border p-4 transition-colors hover:bg-sand/60"
          >
            <p className="flex items-center gap-1.5 text-caption uppercase tracking-wide text-warm-500">
              <Send className="size-3.5" /> Amostras aguardando cliente
            </p>
            {amostras.isLoading && <Spinner className="mt-2" />}
            {amostras.isError && <p className="mt-2 text-sm text-error">Erro ao carregar.</p>}
            {enviadas != null && (
              <p className="mt-1 font-display text-h1 text-ink tnum">{enviadas}</p>
            )}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- página ----------------

export default function Dashboard() {
  const { user } = useAuth();
  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-h1 text-ink">Bem-vindo, {user?.nome?.split(' ')[0]}</h1>
        <p className="mt-1 text-muted-foreground">Visão geral do Private Studio · {hoje}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CardRecentes />
        <CardPendentes />
        <CardVolumeMensal />
        <CardPorStatus />
      </div>
    </div>
  );
}
