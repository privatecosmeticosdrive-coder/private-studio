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
