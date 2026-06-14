import { NavLink } from 'react-router-dom';
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
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Wordmark } from '@/components/brand/wordmark';
import { useAuth, type Role } from '@/auth/auth-context';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[]; // se ausente, todos
}

const ITENS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/orcamentos', label: 'Orçamentos', icon: FileText },
  { to: '/formulas', label: 'Fórmulas', icon: FlaskConical },
  { to: '/materias-primas', label: 'Matérias-primas', icon: Boxes },
  { to: '/embalagens', label: 'Embalagens', icon: Package },
  { to: '/amostras', label: 'Amostras', icon: TestTubes },
  { to: '/cotacoes', label: 'Cotações', icon: ClipboardList },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/admin', label: 'Admin', icon: Settings, roles: ['admin'] },
];

export function Sidebar() {
  const { user } = useAuth();
  const itens = ITENS.filter((i) => !i.roles || (user && i.roles.includes(user.role)));

  return (
    <aside className="flex h-full w-64 flex-col bg-ink text-sand">
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <Wordmark invert />
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {itens.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
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
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4 text-caption text-warm-500">
        Private Studio · v9
      </div>
    </aside>
  );
}
