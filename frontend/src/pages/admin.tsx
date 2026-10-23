import * as React from 'react';
import { Users, SlidersHorizontal, Bell } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { AdminUsuarios } from '@/components/admin/admin-usuarios';
import { AdminConfig } from '@/components/admin/admin-config';
import { AdminAlertas } from '@/components/admin/admin-alertas';
import { useCan } from '@/auth/use-can';
import { cn } from '@/lib/utils';

type AbaId = 'usuarios' | 'config' | 'alertas';

const ABAS: { id: AbaId; label: string; icon: LucideIcon }[] = [
  { id: 'usuarios', label: 'Usuários', icon: Users },
  { id: 'config', label: 'Configurações', icon: SlidersHorizontal },
  { id: 'alertas', label: 'Alertas', icon: Bell },
];

export default function Admin() {
  const can = useCan();
  const [aba, setAba] = React.useState<AbaId>('usuarios');

  if (!can('usuario:gerenciar')) {
    return (
      <div className="space-y-4">
        <PageHeader title="Administração" />
        <p className="text-sm text-muted-foreground">
          Acesso restrito a administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administração"
        description="Equipe, parâmetros do sistema e alertas operacionais."
      />

      {/* Abas */}
      <div className="-mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        <nav className="-mb-px flex gap-1 whitespace-nowrap">
          {ABAS.map(({ id, label, icon: Icon }) => {
            const ativa = aba === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setAba(id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4',
                  ativa
                    ? 'border-gold-500 text-ink'
                    : 'border-transparent text-warm-500 hover:text-ink',
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {aba === 'usuarios' && <AdminUsuarios />}
      {aba === 'config' && <AdminConfig />}
      {aba === 'alertas' && <AdminAlertas />}
    </div>
  );
}
