import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  FileText,
  FlaskConical,
  Boxes,
  Package,
  TestTubes,
  ClipboardList,
  Users,
  Settings,
  Calculator,
  Barcode,
  ClipboardCheck,
  Beaker,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Wordmark } from '@/components/brand/wordmark';
import { useAuth, type Role } from '@/auth/auth-context';
import { pendenciasLabApi } from '@/lib/services/pendencias-lab';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[]; // se ausente, todos
  custos?: boolean; // requer pode_ver_custos (ou admin) — espelha o gate das páginas
  badgeKey?: 'lab'; // badge dinâmico (count) — resolvido no render
}

const ITENS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/orcamentos', label: 'Orçamentos', icon: FileText },
  { to: '/formulas', label: 'Fórmulas', icon: FlaskConical },
  { to: '/laboratorio', label: 'Laboratório', icon: Beaker, badgeKey: 'lab' },
  { to: '/materias-primas', label: 'Matérias-primas', icon: Boxes },
  { to: '/embalagens', label: 'Embalagens', icon: Package },
  { to: '/amostras', label: 'Amostras', icon: TestTubes },
  { to: '/cotacoes', label: 'Cotações', icon: ClipboardList },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/matriz-custo', label: 'Matriz de Custo', icon: Calculator, custos: true },
  { to: '/viabilidade', label: 'Viabilidade', icon: TrendingUp, custos: true },
  { to: '/ncm', label: 'NCM', icon: Barcode, custos: true },
  { to: '/revisao-ncm', label: 'Revisão NCM', icon: ClipboardCheck, roles: ['admin', 'pd'] },
  { to: '/admin', label: 'Admin', icon: Settings, roles: ['admin'] },
];

export function Sidebar({ aberto = false, onFechar }: { aberto?: boolean; onFechar?: () => void }) {
  const { user } = useAuth();
  const podeVerCustos = !!user && (user.pode_ver_custos || user.role === 'admin');
  const itens = ITENS.filter((i) => {
    if (i.roles && !(user && i.roles.includes(user.role))) return false;
    if (i.custos && !podeVerCustos) return false;
    return true;
  });

  // Badge da aba Laboratório — pendências abertas + em atendimento (fila pública).
  const { data: labCount } = useQuery({
    queryKey: ['pendencias-lab', 'contagem'],
    queryFn: () => pendenciasLabApi.contagem(),
    refetchInterval: 60_000,
  });

  return (
    <>
    {/* fundo escuro da gaveta (só no celular) */}
    <div
      className={cn('fixed inset-0 z-40 bg-ink/50 transition-opacity lg:hidden', aberto ? 'opacity-100' : 'pointer-events-none opacity-0')}
      onClick={onFechar}
      aria-hidden
    />
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] flex-col bg-ink text-sand shadow-xl transition-transform duration-200',
        'lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 lg:shadow-none',
        aberto ? 'translate-x-0' : '-translate-x-full',
      )}
      aria-label="Menu principal"
    >
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
        <Wordmark invert />
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar menu"
          className="grid size-10 place-items-center rounded-md text-warm-300 hover:bg-white/5 hover:text-sand lg:hidden"
        >
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {itens.map(({ to, label, icon: Icon, badgeKey }) => {
          const badge = badgeKey === 'lab' && labCount ? labCount : 0;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'group relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-white/5 text-sand'
                    : 'text-warm-300 hover:bg-white/5 hover:text-sand',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* barra dourada no item ativo */}
                  <span
                    className={cn(
                      'absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r bg-gold-500 transition-all',
                      isActive ? 'w-1' : 'w-0',
                    )}
                    aria-hidden
                  />
                  <Icon className={cn('size-[18px]', isActive ? 'text-gold-400' : 'text-warm-400 group-hover:text-gold-400')} />
                  <span className="flex-1">{label}</span>
                  {badge > 0 && (
                    <span className="rounded-full bg-gold-500 px-1.5 py-0.5 text-[10px] font-semibold text-ink tnum">
                      {badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4 text-caption text-warm-500">
        Private Studio · v9
      </div>
    </aside>
    </>
  );
}
