import { SetMetadata } from '@nestjs/common';

/** Marca uma rota como publica (ignora o JwtAuthGuard global). */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
