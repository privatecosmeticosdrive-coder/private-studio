import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './auth-context';

export function ProtectedRoute() {
  const { user, carregando } = useAuth();

  if (carregando) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="animate-pulse font-display text-h2 text-warm-400">Private Studio</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
