import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combina classes condicionais + resolve conflitos do Tailwind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata numero como BRL. */
export function brl(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'string' ? Number(n) : n;
  if (Number.isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Cotacao vencida: sem data ou com mais de 12 meses (espelha o backend de MPs). */
export function cotacaoVencida(dataCotacao: string | null): boolean {
  if (!dataCotacao) return true;
  const d = new Date(dataCotacao);
  if (Number.isNaN(d.getTime())) return true;
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 12);
  return d < limite;
}
