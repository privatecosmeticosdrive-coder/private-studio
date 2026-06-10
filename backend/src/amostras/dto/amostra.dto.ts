import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class SolicitarAmostraDto {
  @IsOptional() @IsInt() @Min(1)
  qtd?: number;

  @IsOptional() @IsString()
  observacoes?: string;
}

export class ObsAmostraDto {
  @IsOptional() @IsString()
  observacoes?: string;
}

export class FeedbackAmostraDto {
  @IsBoolean()
  aprovada!: boolean;

  @IsOptional() @IsString()
  feedback?: string;
}

export class AprovarClienteDto {
  @IsOptional() @IsString()
  observacoes?: string;
}

export class RejeitarClienteDto {
  @IsString()
  @MinLength(2)
  motivo!: string;
}
