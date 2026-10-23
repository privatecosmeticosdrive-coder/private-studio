import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Header } from './header';

/**
 * Layout responsivo: em telas >= lg a barra lateral fica fixa; abaixo disso vira
 * gaveta (abre pelo botão de menu do cabeçalho, fecha ao navegar, ao tocar fora
 * ou com Esc).
 */
export function AppLayout() {
  const [menuAberto, setMenuAberto] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setMenuAberto(false), [pathname]);
  useEffect(() => {
    if (!menuAberto) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAberto(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [menuAberto]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <Sidebar aberto={menuAberto} onFechar={() => setMenuAberto(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onMenu={() => setMenuAberto(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl animate-fade-rise p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
