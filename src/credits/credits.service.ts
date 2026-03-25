import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentRequiredException } from './exceptions/payment-required.exception';

@Injectable()
export class CreditService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateCost(params: {
    model: string;
    resolution?: string;
    durationSeconds?: number;
    sampleCount?: number;
    generateAudio?: boolean;
  }): Promise<number> {
    // Find the most specific matching pricing rule
    const pricingRules = await this.prisma.creditPricing.findMany({
      where: {
        model: params.model,
        active: true,
      },
    });

    if (pricingRules.length === 0) {
      throw new BadRequestException(
        'No pricing configured for this model. Contact admin.',
      );
    }

    // Score each rule by specificity (more specific fields matched = higher score)
    let bestRule = pricingRules[0];
    let bestScore = -1;

    for (const rule of pricingRules) {
      let score = 0;

      // Check resolution match
      if (rule.resolution && rule.resolution === params.resolution) {
        score += 2;
      } else if (rule.resolution && rule.resolution !== params.resolution) {
        continue; // Skip non-matching specific rules
      }

      // Check duration match
      if (
        rule.durationSeconds &&
        rule.durationSeconds === params.durationSeconds
      ) {
        score += 1;
      } else if (
        rule.durationSeconds &&
        rule.durationSeconds !== params.durationSeconds
      ) {
        continue;
      }

      if (score > bestScore) {
        bestScore = score;
        bestRule = rule;
      }
    }

    let cost = bestRule.baseCost;
    const multipliers = bestRule.multipliers as Record<string, number> | null;

    // Apply sample_count multiplier
    const sampleCount = params.sampleCount || 1;
    if (multipliers?.sample_count_multiplier) {
      cost = cost * sampleCount * multipliers.sample_count_multiplier;
    } else {
      cost = cost * sampleCount;
    }

    // Apply audio surcharge
    if (params.generateAudio !== false && multipliers?.audio_surcharge) {
      cost += multipliers.audio_surcharge;
    }

    return Math.ceil(cost);
  }

  async deductCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, any>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });

      if (!user) throw new NotFoundException('User not found');
      if (user.credits < amount) {
        throw new PaymentRequiredException(
          `Insufficient credits. Required: ${amount}, available: ${user.credits}`,
        );
      }

      const newBalance = user.credits - amount;

      await tx.user.update({
        where: { id: userId },
        data: { credits: newBalance },
      });

      return tx.creditTransaction.create({
        data: {
          userId,
          type: 'deduction',
          amount: -amount,
          balanceAfter: newBalance,
          description,
          metadata: metadata ?? undefined,
        },
      });
    });
  }

  async addCredits(
    userId: string,
    amount: number,
    type: 'purchase' | 'refund' | 'auto_recharge' | 'admin_grant',
    description: string,
    stripePaymentIntentId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { credits: { increment: amount } },
      });

      return tx.creditTransaction.create({
        data: {
          userId,
          type,
          amount,
          balanceAfter: user.credits,
          description,
          stripePaymentIntentId,
        },
      });
    });
  }

  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        credits: true,
        autoRechargeEnabled: true,
        autoRechargeThreshold: true,
        autoRechargeAmount: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      credits: user.credits,
      autoRecharge: {
        enabled: user.autoRechargeEnabled,
        threshold: user.autoRechargeThreshold,
        amount: user.autoRechargeAmount,
      },
    };
  }

  async getTransactions(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.creditTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.creditTransaction.count({ where: { userId } }),
    ]);

    return {
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPricing() {
    return this.prisma.creditPricing.findMany({
      where: { active: true },
      orderBy: [{ model: 'asc' }, { resolution: 'asc' }],
    });
  }

  async needsAutoRecharge(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        credits: true,
        autoRechargeEnabled: true,
        autoRechargeThreshold: true,
        stripeCustomerId: true,
      },
    });

    return !!(
      user &&
      user.autoRechargeEnabled &&
      user.stripeCustomerId &&
      user.credits < user.autoRechargeThreshold
    );
  }
}
