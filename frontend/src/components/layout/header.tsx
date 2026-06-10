import { Bell, LogOut, Search } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  comercial: 'Comercial',
  pd: 'P&D',
  compras: 'Compras',
  producao: 'Producao',
};

export function Header() {
  const { user, logout } = useAuth();
  const iniciais = (user?.nome ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <header className="flex h-16 items-center justify-between border-b-2 border-gold-500/60 bg-surface px-6">
      {/* busca (decorativa por ora) */}
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-400" />
        <input
          type="search"
          placeholder="Buscar..."
          aria-label="Buscar"
          className="h-9 w-full rounded-md border border-border bg-sand pl-9 pr-3 text-sm text-ink placeholder:text-warm-500 focus-visible:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Alertas"
          className="relative grid size-9 cursor-pointer place-items-center rounded-md text-warm-600 transition-colors hover:bg-warm-100 hover:text-ink"
        >
          <Bell className="size-[18px]" />
        </button>

        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-ink font-display text-sm text-gold-400">
            {iniciais}
          </div>
          <div className="leading-tight">
            <div className="text-sm font-medium text-ink">{user?.nome}</div>
            <div className="text-caption text-muted-foreground">
              {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Sair"
            className="ml-1 grid size-9 cursor-pointer place-items-center rounded-md text-warm-600 transition-colors hover:bg-error-soft hover:text-error"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </div>
    </header>
  );
}
