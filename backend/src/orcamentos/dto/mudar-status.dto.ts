import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { MOTIVOS_RECUSA } from '../status-orcamento.util';
import { URGENCIAS } from '../../pendencias-lab/dto/create-pendencia.dto';

/** Destinos possíveis (a máquina valida a transição a partir do status atual). */
export const STATUS_DESTINOS = ['enviado', 'aprovado_cliente', 'recusado'] as const;

export class MudarStatusDto {
  @IsIn(STATUS_DESTINOS as unknown as string[])
  status!: string;

  // FASE 3 — motivo categorizado, obrigatório só na recusa. A máquina
  // (`validarTransicao`) revalida no serviço: o DTO não é a única autoridade.
  @ValidateIf((o) => o.status === 'recusado')
  @IsIn(MOTIVOS_RECUSA as unknown as string[])
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacao?: string;

  // Urgência da pendência de revisão que nasce do gatilho — perguntada no
  // dialog e exigida SÓ quando motivo='formula' (único caso que cria pendência).
  @ValidateIf((o) => o.status === 'recusado' && o.motivo === 'formula')
  @IsIn(URGENCIAS as unknown as string[])
  urgencia?: string;
}
