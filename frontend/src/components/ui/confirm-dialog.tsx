import * as React from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  /** botao de confirmacao em vermelho (acoes destrutivas) */
  destructive?: boolean;
}

/** Dialogo de confirmacao generico (sim/nao) sobre o Modal base. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  loading = false,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => !loading && onClose()}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={loading}>
            {loading && <Spinner className="text-sand" />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className="text-sm text-warm-700">{description}</div>}
    </Modal>
  );
}
