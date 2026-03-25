import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, name?: string) {
    const key = randomBytes(32).toString('hex');

    const apiKey = await this.prisma.apiKey.create({
      data: {
        userId,
        key,
        name: name || 'default',
      },
    });

    return {
      id: apiKey.id,
      key,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
    };
  }

  async findAllByUser(userId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      key: k.key.substring(0, 8) + '...' + k.key.substring(k.key.length - 4),
      active: k.active,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    }));
  }

  async revoke(userId: string, keyId: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: keyId, userId },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { active: false },
    });

    return { message: 'API key revoked' };
  }
}
