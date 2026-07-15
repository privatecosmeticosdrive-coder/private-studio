import { IsIn } from 'class-validator';

/** Destinos possíveis (a máquina valida a transição a partir do status atual). */
export const STATUS_DESTINOS = ['enviado', 'aprovado_cliente', 'recusado'] as const;

export class MudarStatusDto {
  @IsIn(STATUS_DESTINOS as unknown as string[])
  status!: string;
  // [HOOK fase 4]: motivo categorizado da recusa entra aqui (obrigatório p/ recusado).
}
