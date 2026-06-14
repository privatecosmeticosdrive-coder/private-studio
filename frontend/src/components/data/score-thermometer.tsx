import { RadialBar, RadialBarChart, PolarAngleAxis } from 'recharts';
import { cn } from '@/lib/utils';

/** Faixas do termometro de assertividade (Doc 1 §7). */
export function faixaScore(score: number): { cor: string; label: string } {
  if (score >= 80) return { cor: 'rgb(46 125 82)', label: 'Confiável' }; // verde
  if (score >= 60) return { cor: 'rgb(201 162 39)', label: 'Atenção' }; // amarelo
  if (score >= 40) return { cor: 'rgb(194 65 12)', label: 'Frágil' }; // laranja
  return { cor: 'rgb(179 64 46)', label: 'Crítico' }; // vermelho
}

interface ScoreThermometerProps {
  score: number;
  size?: number;
  /** mostra a legenda da faixa abaixo do numero */
  showLabel?: boolean;
  className?: string;
}

/** Termometro de score (gauge radial) com cor por faixa. */
export function ScoreThermometer({ score, size = 132, showLabel = true, className }: ScoreThermometerProps) {
  const v = Math.max(0, Math.min(100, Math.round(score)));
  const { cor, label } = faixaScore(v);
  const data = [{ name: 'score', value: v, fill: cor }];

  return (
    <div className={cn('relative inline-flex flex-col items-center', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <RadialBarChart
          width={size}
          height={size}
          cx="50%"
          cy="50%"
          innerRadius="72%"
          outerRadius="100%"
          barSize={10}
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            background={{ fill: 'rgb(242 236 227)' }}
            dataKey="value"
            cornerRadius={size}
            angleAxisId={0}
          />
        </RadialBarChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-h2 leading-none text-ink tnum" style={{ color: cor }}>
            {v}
          </span>
          <span className="text-caption uppercase tracking-wide text-warm-500">score</span>
        </div>
      </div>
      {showLabel && (
        <span className="mt-1 text-sm font-medium" style={{ color: cor }}>
          {label}
        </span>
      )}
    </div>
  );
}
