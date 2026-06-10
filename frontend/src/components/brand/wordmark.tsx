import { cn } from '@/lib/utils';

/**
 * Wordmark placeholder enquanto nao ha logo.png oficial.
 * Quando o arquivo existir em /public/logo.png, troque por <img src="/logo.png" />.
 */
export function Wordmark({
  className,
  monogramOnly = false,
  invert = false,
}: {
  className?: string;
  monogramOnly?: boolean;
  invert?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {/* monograma: P em moldura dourada */}
      <span
        className={cn(
          'grid h-9 w-9 place-items-center rounded-md border font-display text-lg leading-none',
          invert ? 'border-gold-500 text-gold-400' : 'border-gold-500 text-gold-600',
        )}
        aria-hidden
      >
        P
      </span>
      {!monogramOnly && (
        <span className="font-display text-h3 leading-none">
          <span className={invert ? 'text-sand' : 'text-ink'}>Private</span>{' '}
          <span className="text-gold-500">Studio</span>
        </span>
      )}
    </span>
  );
}
