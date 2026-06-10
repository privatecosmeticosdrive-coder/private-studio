import { useAuth } from '@/auth/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Dashboard() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-h1 text-ink">Bem-vindo, {user?.nome?.split(' ')[0]}</h1>
        <p className="mt-1 text-muted-foreground">Visao geral do Private Studio.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            KPIs, ultimos orcamentos e alertas chegam no <strong className="text-ink">Dia 9</strong>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
