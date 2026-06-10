import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useAuth } from '@/auth/auth-context';
import { Wordmark } from '@/components/brand/wordmark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  email: z.string().email('Email invalido'),
  senha: z.string().min(6, 'Minimo 6 caracteres'),
});
type FormData = z.infer<typeof schema>;

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [erro, setErro] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (data: FormData) => {
    setErro(null);
    try {
      await login(data.email, data.senha);
      navigate('/dashboard', { replace: true });
    } catch (e) {
      const ax = e as AxiosError<{ message?: string }>;
      setErro(ax.response?.status === 401 ? 'Credenciais invalidas.' : 'Falha ao entrar. Tente novamente.');
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-rise">
        <div className="mb-8 flex flex-col items-center text-center">
          <Wordmark monogramOnly className="mb-4 [&>span]:h-14 [&>span]:w-14 [&>span]:text-3xl" />
          <h1 className="font-display text-display text-ink">
            Private <span className="text-gold-600">Studio</span>
          </h1>
          <div className="mt-2 h-px w-24 bg-gold-500" />
          <p className="mt-3 text-sm text-muted-foreground">
            Plataforma de orcamento cosmetico
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-8 shadow-md">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="voce@privatecosmeticos.com.br" {...register('email')} />
              {errors.email && <p className="text-caption text-error">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input id="senha" type="password" autoComplete="current-password" placeholder="••••••••" {...register('senha')} />
              {errors.senha && <p className="text-caption text-error">{errors.senha.message}</p>}
            </div>

            {erro && (
              <div className="rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm text-error">
                {erro}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              {isSubmitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-caption text-warm-500">
          Acesso restrito · Private Cosmeticos
        </p>
      </div>
    </div>
  );
}
