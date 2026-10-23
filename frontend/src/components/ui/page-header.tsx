import * as React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** acoes alinhadas a direita (ex.: botao "Novo") */
  actions?: React.ReactNode;
}

/** Cabecalho padrao de tela: titulo display + descricao + acoes. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[1.75rem] leading-tight text-ink sm:text-h1">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
