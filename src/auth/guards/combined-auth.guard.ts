import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class CombinedAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    // 1. Try JWT (Bearer token)
    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const payload = this.jwtService.verify(token);
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
        });
        if (user) {
          request.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            credits: user.credits,
          };
          return true;
        }
      } catch {
        // JWT invalid, fall through to API key
      }
    }

    // 2. Try x-api-key header
    const apiKey = request.headers['x-api-key'];
    if (apiKey) {
      // 2a. Check admin key (backward compat)
      const adminKey = this.configService.get<string>('API_KEY');
      if (adminKey && apiKey === adminKey) {
        request.user = { id: 'admin', email: 'admin@system', role: 'admin' };
        return true;
      }

      // 2b. Check user API key in database
      const keyRecord = await this.prisma.apiKey.findFirst({
        where: { key: apiKey, active: true },
        include: { user: true },
      });
      if (keyRecord) {
        request.user = {
          id: keyRecord.user.id,
          email: keyRecord.user.email,
          role: keyRecord.user.role,
          credits: keyRecord.user.credits,
        };
        // Update lastUsedAt (non-blocking)
        this.prisma.apiKey
          .update({
            where: { id: keyRecord.id },
            data: { lastUsedAt: new Date() },
          })
          .catch(() => {});
        return true;
      }
    }

    throw new UnauthorizedException('Invalid or missing authentication');
  }
}
