import { IsIn, IsISO8601, IsNumber, IsString, Max, Min, MinLength } from 'class-validator';

/** Chaves consumidas pela matriz fiscal (F4 Fase A). Nova chave exige código que a leia. */
export const CHAVES_PARAMETRO_FISCAL = [
  'pis_monofasico_pct',
  'cofins_monofasico_pct',
  'pis_comum_pct',
  'cofins_comum_pct',
  'icms_carga_art34_pct',
  'icms_nominal_padrao_pct',
  'industrializacao_caracterizada', // flag juridica 0/1 (A3) — opt-in documentado
] as const;

export class CreateParametroFiscalDto {
  @IsIn(CHAVES_PARAMETRO_FISCAL as unknown as string[])
  chave!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  valor!: number;

  @IsISO8601()
  vigencia_inicio!: string; // data de inicio da NOVA vigencia (a anterior e encerrada no dia anterior)

  @IsString()
  @MinLength(10)
  fundamento_legal!: string; // obrigatorio e substantivo — D4: todo parametro tem fundamento
}
