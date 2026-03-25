import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { CreditService } from '../credits/credits.service';
import { ConfigureAutoRechargeDto } from './dto/configure-auto-recharge.dto';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
  ) {
    this.stripe = new Stripe(configService.get<string>('STRIPE_SECRET_KEY'));
  }

  async ensureStripeCustomer(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.stripeCustomerId) return user.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { userId },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  async createPurchaseIntent(userId: string, packageId: string) {
    const pkg = await this.prisma.creditPackage.findUnique({
      where: { id: packageId },
    });
    if (!pkg || !pkg.active) {
      throw new NotFoundException('Credit package not found');
    }

    const customerId = await this.ensureStripeCustomer(userId);

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: pkg.priceInCents,
      currency: 'usd',
      customer: customerId,
      metadata: {
        userId,
        packageId,
        credits: pkg.credits.toString(),
        type: 'credit_purchase',
      },
      automatic_payment_methods: { enabled: true },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: pkg.priceInCents,
      credits: pkg.credits,
    };
  }

  async createSetupIntent(userId: string) {
    const customerId = await this.ensureStripeCustomer(userId);

    const setupIntent = await this.stripe.setupIntents.create({
      customer: customerId,
      automatic_payment_methods: { enabled: true },
    });

    return { clientSecret: setupIntent.client_secret };
  }

  async listPaymentMethods(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user?.stripeCustomerId) return [];

    const methods = await this.stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    });

    return methods.data.map((m) => ({
      id: m.id,
      brand: m.card?.brand,
      last4: m.card?.last4,
      expMonth: m.card?.exp_month,
      expYear: m.card?.exp_year,
    }));
  }

  async detachPaymentMethod(userId: string, paymentMethodId: string) {
    // Verify the payment method belongs to this user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user?.stripeCustomerId) {
      throw new NotFoundException('No Stripe customer found');
    }

    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== user.stripeCustomerId) {
      throw new NotFoundException('Payment method not found');
    }

    await this.stripe.paymentMethods.detach(paymentMethodId);
    return { message: 'Payment method removed' };
  }

  async configureAutoRecharge(userId: string, dto: ConfigureAutoRechargeDto) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        autoRechargeEnabled: dto.enabled,
        autoRechargeThreshold: dto.threshold,
        autoRechargeAmount: dto.amount,
      },
    });

    return {
      enabled: dto.enabled,
      threshold: dto.threshold,
      amount: dto.amount,
    };
  }

  async chargeAutoRecharge(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user?.stripeCustomerId || !user.autoRechargeEnabled) return;

    // Find a matching credit package for the desired amount
    const pkg = await this.prisma.creditPackage.findFirst({
      where: { credits: user.autoRechargeAmount, active: true },
    });
    if (!pkg) return;

    // Get default payment method
    const customer = await this.stripe.customers.retrieve(
      user.stripeCustomerId,
    );
    if ((customer as any).deleted) return;

    const defaultPm =
      (customer as any).invoice_settings?.default_payment_method as string;
    if (!defaultPm) {
      // Try to use the first available payment method
      const methods = await this.stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
        limit: 1,
      });
      if (methods.data.length === 0) return;

      await this.stripe.paymentIntents.create({
        amount: pkg.priceInCents,
        currency: 'usd',
        customer: user.stripeCustomerId,
        payment_method: methods.data[0].id,
        off_session: true,
        confirm: true,
        metadata: {
          userId: user.id,
          packageId: pkg.id,
          credits: pkg.credits.toString(),
          type: 'auto_recharge',
        },
      });
    } else {
      await this.stripe.paymentIntents.create({
        amount: pkg.priceInCents,
        currency: 'usd',
        customer: user.stripeCustomerId,
        payment_method: defaultPm,
        off_session: true,
        confirm: true,
        metadata: {
          userId: user.id,
          packageId: pkg.id,
          credits: pkg.credits.toString(),
          type: 'auto_recharge',
        },
      });
    }

    // Credits will be added via webhook when payment succeeds
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { userId, credits, type } = pi.metadata;

        if (!userId || !credits) return;

        // Idempotency check
        const existing = await this.prisma.creditTransaction.findFirst({
          where: { stripePaymentIntentId: pi.id },
        });
        if (existing) return;

        await this.creditService.addCredits(
          userId,
          parseInt(credits),
          type === 'auto_recharge' ? 'auto_recharge' : 'purchase',
          `${type === 'auto_recharge' ? 'Auto-recharge' : 'Purchase'}: ${credits} credits`,
          pi.id,
        );
        break;
      }
    }
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET'),
    );
  }

  async getPackages() {
    return this.prisma.creditPackage.findMany({
      where: { active: true },
      orderBy: { credits: 'asc' },
    });
  }
}
