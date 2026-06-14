import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { brl } from '@/lib/utils';

export interface PontoPreco {
  data: string; // ISO
  preco: number;
}

function fmtData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' });
}

interface PriceHistoryChartProps {
  pontos: PontoPreco[];
  height?: number;
  /** sufixo do eixo/tooltip, ex.: '/kg' ou '/un' */
  unidade?: string;
}

/** Linha temporal de preco (kg ou unidade) com tooltip em BRL. */
export function PriceHistoryChart({ pontos, height = 240, unidade = '' }: PriceHistoryChartProps) {
  if (pontos.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Sem histórico de preço registrado.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={pontos} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(231 222 207)" vertical={false} />
        <XAxis
          dataKey="data"
          tickFormatter={fmtData}
          tick={{ fontSize: 11, fill: 'rgb(110 94 71)' }}
          stroke="rgb(214 201 181)"
        />
        <YAxis
          width={68}
          tick={{ fontSize: 11, fill: 'rgb(110 94 71)' }}
          stroke="rgb(214 201 181)"
          tickFormatter={(v: number) => brl(v)}
        />
        <Tooltip
          formatter={(value) => [`${brl(Number(value))}${unidade}`, 'Preço']}
          labelFormatter={(label) =>
            new Date(String(label)).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          }
          contentStyle={{
            borderRadius: 10,
            border: '1px solid rgb(231 222 207)',
            fontSize: 13,
            fontFamily: '"DM Sans", system-ui, sans-serif',
          }}
        />
        <Line
          type="monotone"
          dataKey="preco"
          stroke="rgb(184 131 42)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'rgb(184 131 42)' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
