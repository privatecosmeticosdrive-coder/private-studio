import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/** Restringe a rota aos roles informados (checado pelo RolesGuard). */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
