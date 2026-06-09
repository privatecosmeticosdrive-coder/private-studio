import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

function sanitizar(user: User) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    role: user.role,
    ativo: user.ativo,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Valida email + senha; lanca 401 generico (nao revela qual falhou). */
  async validateUser(email: string, senha: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.ativo) {
      throw new UnauthorizedException('Credenciais invalidas');
    }
    const ok = await bcrypt.compare(senha, user.password_hash);
    if (!ok) throw new UnauthorizedException('Credenciais invalidas');
    return user;
  }

  async login(email: string, senha: string) {
    const user = await this.validateUser(email, senha);
    return this.gerarTokens(user);
  }

  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwt.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token invalido ou expirado');
    }
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Token nao e um refresh token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.ativo) throw new UnauthorizedException('Usuario inativo');
    return this.gerarTokens(user);
  }

  /** Dados atuais do usuario logado (sempre fresco do banco). */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return sanitizar(user);
  }

  private gerarTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      nome: user.nome,
    };
    const access_token = this.jwt.sign(payload);
    const refresh_token = this.jwt.sign(
      { sub: user.id, typ: 'refresh' },
      { expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d') as any },
    );
    return { access_token, refresh_token, user: sanitizar(user) };
  }
}
